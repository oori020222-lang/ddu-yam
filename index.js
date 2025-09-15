import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import sqlite3 from 'sqlite3';
import express from 'express';

// ======================
// Render 우회용 웹서버
// ======================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ======================
// 디스코드 봇 설정
// ======================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
const db = new sqlite3.Database('./database.db');
const fmt = (n) => Number(n).toLocaleString();

// DB 초기화
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT,
    guildId TEXT,
    balance INTEGER,
    lastDaily TEXT,
    PRIMARY KEY (id, guildId)
  )
`);

// 관리자 모드 상태
let adminMode = false;
const adminId = "627846998074327051"; // 본인 Discord ID

// 색상
const COLOR_SUCCESS = 0x57f287;
const COLOR_ERROR = 0xed4245;
const COLOR_INFO = 0x3498db;

client.once('ready', () => {
  console.log(`🤖 ${client.user.tag}로 로그인함`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  const { commandName, options, user, guild } = interaction;

  if (interaction.isChatInputCommand()) {
    await interaction.deferReply({ ephemeral: commandName.startsWith("관리자") });

    // ======================
    // /돈내놔
    // ======================
    if (commandName === '돈내놔') {
      const today = new Date().toDateString();
      db.get("SELECT balance, lastDaily FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
        if (!row) {
          db.run("INSERT INTO users (id, guildId, balance, lastDaily) VALUES (?, ?, 20000, ?)", [user.id, guild.id, today]);
          const embed = new EmbedBuilder()
            .setColor(COLOR_SUCCESS)
            .setTitle("💸 첫 돈 지급!")
            .setDescription(`20,000원을 지급했습니다!\n현재 잔액: ${fmt(20000)}`);
          return interaction.editReply({ embeds: [embed] });
        }
        if (row.lastDaily === today) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("⏳ 이미 받음")
            .setDescription("오늘은 이미 돈을 받았습니다. 내일 다시 시도해주세요!");
          return interaction.editReply({ embeds: [embed] });
        }
        const newBalance = row.balance + 20000;
        db.run("UPDATE users SET balance = ?, lastDaily = ? WHERE id = ? AND guildId = ?", [newBalance, today, user.id, guild.id]);
        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("💸 돈 지급 완료!")
          .setDescription(`20,000원을 받았습니다!\n현재 잔액: ${fmt(newBalance)}`);
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ======================
    // /잔액
    // ======================
    else if (commandName === '잔액') {
      db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
        if (!row) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 계정 없음")
            .setDescription("아직 돈을 받은 적이 없습니다! `/돈내놔`로 시작하세요.");
          return interaction.editReply({ embeds: [embed] });
        }
        const embed = new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setTitle("💰 현재 잔액")
          .setDescription(`${fmt(row.balance)} 코인`);
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ======================
    // /동전던지기
    // ======================
    else if (commandName === '동전던지기') {
      const side = options.getString('선택');
      const bet = options.getInteger('금액');
      db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
        if (!row || bet <= 0 || row.balance < bet) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 실패")
            .setDescription("계정이 없거나 잔액 부족 혹은 금액 오류입니다.");
          return interaction.editReply({ embeds: [embed] });
        }
        const result = Math.random() < 0.5 ? '앞면' : '뒷면';
        let newBalance = row.balance;
        let embed;
        if (result === side) {
          newBalance += bet;
          embed = new EmbedBuilder()
            .setColor(COLOR_SUCCESS)
            .setTitle(`🎉 ${result}! 승리`)
            .setDescription(`+${fmt(bet)}\n현재 잔액: ${fmt(newBalance)}`);
        } else {
          newBalance -= bet;
          embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle(`😢 ${result}! 패배`)
            .setDescription(`-${fmt(bet)}\n현재 잔액: ${fmt(newBalance)}`);
        }
        db.run("UPDATE users SET balance = ? WHERE id = ? AND guildId = ?", [newBalance, user.id, guild.id]);
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ======================
    // /야바위
    // ======================
    else if (commandName === '야바위') {
      const bet = options.getInteger('금액');
      db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], async (err, row) => {
        if (!row || row.balance < bet || bet < 1000) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 베팅 실패")
            .setDescription("계정이 없거나 잔액이 부족하거나 최소 베팅(1000) 미만입니다.");
          return interaction.editReply({ embeds: [embed] });
        }
        const cards = ['❌', '❌', '🎉']; 
        const shuffled = cards.sort(() => Math.random() - 0.5);
        const rowButtons = new ActionRowBuilder().addComponents(
          shuffled.map((symbol, i) =>
            new ButtonBuilder()
              .setCustomId(`yabawi_${i}_${bet}_${symbol}`)
              .setLabel(`카드 ${i + 1}`)
              .setStyle(ButtonStyle.Primary)
          )
        );
        const embed = new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setTitle("🎲 야바위 게임")
          .setDescription("3장의 카드 중 하나를 선택하세요!");
        interaction.editReply({ embeds: [embed], components: [rowButtons] });
      });
    }

    // ======================
    // /송금
    // ======================
    else if (commandName === '송금') {
      const target = options.getUser('받는사람');
      const amount = options.getInteger('금액');
      if (user.id === target.id || amount <= 0) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 송금 불가")
          .setDescription("자기 자신에게는 송금할 수 없고 금액은 1 이상이어야 합니다.");
        return interaction.editReply({ embeds: [embed] });
      }
      db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, senderRow) => {
        if (!senderRow || senderRow.balance < amount) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 실패")
            .setDescription("잔액 부족 또는 계정 없음");
          return interaction.editReply({ embeds: [embed] });
        }
        db.run("INSERT OR IGNORE INTO users (id, guildId, balance, lastDaily) VALUES (?, ?, 0, '')", [target.id, guild.id]);
        db.run("UPDATE users SET balance = balance - ? WHERE id = ? AND guildId = ?", [amount, user.id, guild.id]);
        db.run("UPDATE users SET balance = balance + ? WHERE id = ? AND guildId = ?", [amount, target.id, guild.id]);
        const senderNick = guild.members.cache.get(user.id)?.displayName || user.username;
        const targetNick = guild.members.cache.get(target.id)?.displayName || target.username;
        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("💸 송금 완료")
          .setDescription(`${senderNick} → ${targetNick}\n금액: ${fmt(amount)} 코인`);
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ======================
    // /랭킹
    // ======================
    else if (commandName === '랭킹') {
      const type = options.getString('종류');
      if (type === 'server') {
        db.all("SELECT id, balance FROM users WHERE guildId = ? AND balance > 0 ORDER BY balance DESC LIMIT 10", [guild.id], (err, rows) => {
          if (!rows || rows.length === 0) {
            const embed = new EmbedBuilder().setColor(COLOR_ERROR).setTitle("📉 데이터 없음");
            return interaction.editReply({ embeds: [embed] });
          }
          let rankMsg = rows.map((row, i) => {
            const member = guild.members.cache.get(row.id);
            const name = member?.displayName || row.id;
            const trophy = i < 3 ? "🏆" : `#${i + 1}`;
            return `${trophy} ${name} — ${fmt(row.balance)} 코인`;
          }).join("\n");
          const embed = new EmbedBuilder()
            .setColor(COLOR_INFO)
            .setTitle(`⭐ ${guild.name} 서버 랭킹`)
            .setDescription(rankMsg);
          interaction.editReply({ embeds: [embed] });
        });
      } else if (type === 'global') {
        db.all("SELECT id, SUM(balance) as total FROM users GROUP BY id HAVING total > 0 ORDER BY total DESC LIMIT 10", (err, rows) => {
          if (!rows || rows.length === 0) {
            const embed = new EmbedBuilder().setColor(COLOR_ERROR).setTitle("📉 데이터 없음");
            return interaction.editReply({ embeds: [embed] });
          }
          let rankMsg = rows.map((row, i) => {
            const member = client.users.cache.get(row.id);
            const name = member?.username || row.id;
            const trophy = i < 3 ? "🏆" : `#${i + 1}`;
            return `${trophy} ${name} — ${fmt(row.total)} 코인`;
          }).join("\n");
          const embed = new EmbedBuilder()
            .setColor(COLOR_INFO)
            .setTitle("🏆 전체 서버 랭킹")
            .setDescription(rankMsg);
          interaction.editReply({ embeds: [embed] });
        });
      }
    }

    // ======================
    // /청소
    // ======================
    else if (commandName === '청소') {
      const amount = options.getInteger('개수');
      if (amount < 1 || amount > 100) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 범위 오류")
          .setDescription("1~100개까지만 삭제할 수 있습니다!");
        return interaction.editReply({ embeds: [embed] });
      }
      const channel = interaction.channel;
      const messages = await channel.bulkDelete(amount, true);
      const embed = new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("🧹 청소 완료")
        .setDescription(`${messages.size}개의 메시지를 삭제했습니다.`);
      interaction.editReply({ embeds: [embed] });
    }

    // ======================
    // /대박복권
    // ======================
    else if (commandName === '대박복권') {
      let bet = options.getInteger('금액');
      db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
        if (!row || row.balance < bet || bet < 1000) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 실패")
            .setDescription("계정 없음, 잔액 부족, 최소 베팅 1000 이상이어야 합니다.");
          return interaction.editReply({ embeds: [embed] });
        }
        const SLOT_SYMBOLS = ["🥚", "🐣", "🐥", "🐔", "🍗", "💎"];
        const SLOT_WEIGHTS = [34.9, 30, 20, 10, 5, 0.1];
        const SLOT_PAYOUTS = { "🐣": 2, "🐥": 3, "🐔": 5, "🍗": 10, "💎": 100 };
        const r = Math.random() * 100;
        let sum = 0, result = "🥚";
        for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
          sum += SLOT_WEIGHTS[i];
          if (r < sum) { result = SLOT_SYMBOLS[i]; break; }
        }
        let payout = SLOT_PAYOUTS[result] ? bet * SLOT_PAYOUTS[result] : 0;
        const delta = payout - bet;
        const newBalance = row.balance + delta;
        db.run("UPDATE users SET balance = ? WHERE id = ? AND guildId = ?", [newBalance, user.id, guild.id]);
        let embed;
        if (payout > 0) {
          const title = result === "💎" ? "✨ 초대박! 100배 당첨! ✨" : `🎰 당첨! x${SLOT_PAYOUTS[result]}`;
          embed = new EmbedBuilder()
            .setColor(COLOR_SUCCESS)
            .setTitle(title)
            .setDescription(`결과: ${result}\n획득: ${fmt(payout)} (순이익 ${delta >= 0 ? "+" : ""}${fmt(delta)})\n현재 잔액: ${fmt(newBalance)}`);
        } else {
          embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 꽝")
            .setDescription(`결과: ${result}\n-${fmt(bet)}\n현재 잔액: ${fmt(newBalance)}`);
        }
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ======================
    // /관리자권한
    // ======================
    else if (commandName === '관리자권한') {
      if (user.id !== adminId) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 권한 없음")
          .setDescription("이 명령어는 관리자만 사용할 수 있습니다!");
        return interaction.editReply({ embeds: [embed], ephemeral: true });
      }
      adminMode = !adminMode;
      const status = adminMode ? '🟢 ON' : '🔴 OFF';
      const embed = new EmbedBuilder()
        .setColor(adminMode ? COLOR_SUCCESS : COLOR_ERROR)
        .setTitle("⚙️ 관리자 모드 전환")
        .setDescription(`관리자 모드가 ${status} 상태가 되었습니다.`);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    // ======================
    // /관리자지급
    // ======================
    else if (commandName === '관리자지급') {
      if (user.id !== adminId || !adminMode) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 사용 불가")
          .setDescription("관리자 모드가 꺼져 있거나 권한이 없습니다.");
        return interaction.editReply({ embeds: [embed], ephemeral: true });
      }
      const target = options.getUser('대상');
      const amount = options.getInteger('금액');
      if (amount <= 0) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 금액 오류")
          .setDescription("지급 금액은 1 이상이어야 합니다!");
        return interaction.editReply({ embeds: [embed], ephemeral: true });
      }
      db.run("INSERT OR IGNORE INTO users (id, guildId, balance, lastDaily) VALUES (?, ?, 0, '')", [target.id, guild.id]);
      db.run("UPDATE users SET balance = balance + ? WHERE id = ? AND guildId = ?", [amount, target.id, guild.id]);
      const targetNick = guild.members.cache.get(target.id)?.displayName || target.username;
      const embed = new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("✅ 관리자 지급")
        .setDescription(`${targetNick} 님에게 ${fmt(amount)} 코인을 지급했습니다!`);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }
  }

  // ======================
  // 버튼 처리 (야바위)
  // ======================
  if (interaction.isButton() && interaction.customId.startsWith('yabawi')) {
    const [_, index, bet, symbol] = interaction.customId.split('_');
    const result = symbol;

    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [interaction.user.id, interaction.guild.id], (err, row) => {
      if (!row || row.balance < bet) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 오류")
          .setDescription
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 오류")
          .setDescription("잔액이 부족하거나 계정이 없습니다.");
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      let newBalance = row.balance;
      let embed;
      if (result === '🎉') {
        const payout = bet * 3;
        newBalance += (payout - bet);
        embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("🎉 당첨!")
          .setDescription(`3배 당첨! 획득: ${fmt(payout)}\n현재 잔액: ${fmt(newBalance)}`);
      } else {
        newBalance -= bet;
        embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 꽝")
          .setDescription(`-${fmt(bet)}\n현재 잔액: ${fmt(newBalance)}`);
      }

      db.run("UPDATE users SET balance = ? WHERE id = ? AND guildId = ?", [newBalance, interaction.user.id, interaction.guild.id]);
      interaction.update({ embeds: [embed], components: [] });
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
