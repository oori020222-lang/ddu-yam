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

// DB 초기화 (글로벌 balance)
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    balance INTEGER,
    lastDaily TEXT
  )
`);

// 관리자 모드 상태
let adminMode = false;
const adminId = "627846998074327051"; // 본인 Discord ID

// 색상
const COLOR_SUCCESS = 0x57f287;
const COLOR_ERROR = 0xed4245;
const COLOR_INFO = 0x3498db;
const COLOR_ADMIN = 0xfee75c; // 관리자 전용 노랑

client.once('ready', () => {
  console.log(`🤖 ${client.user.tag}로 로그인함`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  const { commandName, options, user, guild } = interaction;
  const nick = guild?.members.cache.get(user.id)?.displayName || user.username;

  if (interaction.isChatInputCommand()) {
    await interaction.deferReply({ ephemeral: commandName.startsWith("관리자") });

    // ======================
    // /돈내놔
    // ======================
    if (commandName === '돈내놔') {
      const today = new Date().toDateString();
      db.get("SELECT balance, lastDaily FROM users WHERE id = ?", [user.id], (err, row) => {
        if (!row) {
          db.run("INSERT INTO users (id, balance, lastDaily) VALUES (?, 20000, ?)", [user.id, today]);
          const embed = new EmbedBuilder()
            .setColor(COLOR_ADMIN)
            .setTitle("🎉 첫 보상 지급 완료! 🎉")
            .setDescription(
              `${nick} 님, 환영합니다!\n\n` +
              `**지급된 코인**\n💰 20,000 코인\n\n` +
              `**시작 안내**\n✨ 오늘부터 코인 게임을 즐겨보세요!`
            )
            .setThumbnail("https://i.imgur.com/hh4d1ZQ.png");
          return interaction.editReply({ embeds: [embed] });
        }

        if (row.lastDaily === today) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("⏳ 이미 받음")
            .setDescription(`${nick} 님,\n오늘은 이미 돈을 받았습니다. 내일 다시 시도해주세요!`)
            .setThumbnail("https://i.imgur.com/kHh3O6g.png");
          return interaction.editReply({ embeds: [embed] });
        }

        const newBalance = row.balance + 20000;
        db.run("UPDATE users SET balance = ?, lastDaily = ? WHERE id = ?", [newBalance, today, user.id]);
        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("💸 돈 지급 완료!")
          .setDescription(
            `**지급 금액**\n💰 20,000 코인\n\n` +
            `**현재 잔액**\n${fmt(newBalance)} 코인`
          )
          .setThumbnail("https://i.imgur.com/hh4d1ZQ.png");
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ======================
    // /잔액
    // ======================
    else if (commandName === '잔액') {
      db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, row) => {
        if (!row) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 계정 없음")
            .setDescription("아직 돈을 받은 적이 없습니다! `/돈내놔`로 시작하세요.");
          return interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setTitle("💰 잔액 💰")
          .setDescription(`${fmt(row.balance)} 코인`)
          .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 64 }))
          .setFooter({ text: nick });

        interaction.editReply({ embeds: [embed] });
      });
    }

    // ======================
    // /동전던지기
    // ======================
    else if (commandName === '동전던지기') {
      const side = options.getString('선택');
      const bet = options.getInteger('금액');

      db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, row) => {
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
            .setDescription(
              `**획득 금액**\n+${fmt(bet)} 코인\n\n` +
              `**순이익**\n+${fmt(bet)} 코인\n\n` +
              `**현재 잔액**\n${fmt(newBalance)} 코인`
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 64 }))
            .setFooter({ text: nick });
        } else {
          newBalance -= bet;
          embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle(`😢 ${result}! 패배`)
            .setDescription(
              `**손실 금액**\n-${fmt(bet)} 코인\n\n` +
              `**순이익**\n-${fmt(bet)} 코인\n\n` +
              `**현재 잔액**\n${fmt(newBalance)} 코인`
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 64 }))
            .setFooter({ text: nick });
        }

        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user.id]);
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ======================
    // /송금
    // ======================
    else if (commandName === '송금') {
      const target = options.getUser('받는사람');
      const amount = options.getInteger('금액');
      const senderNick = guild.members.cache.get(user.id)?.displayName || user.username;
      const targetNick = guild.members.cache.get(target.id)?.displayName || target.username;

      if (user.id === target.id || amount <= 0) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 송금 불가")
          .setDescription("자기 자신에게는 송금할 수 없고 금액은 1 이상이어야 합니다.");
        return interaction.editReply({ embeds: [embed] });
      }

      db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, senderRow) => {
        if (!senderRow || senderRow.balance < amount) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 실패")
            .setDescription("잔액 부족 또는 계정 없음");
          return interaction.editReply({ embeds: [embed] });
        }

        db.run("INSERT OR IGNORE INTO users (id, balance, lastDaily) VALUES (?, 0, '')", [target.id]);
        db.run("UPDATE users SET balance = balance - ? WHERE id = ?", [amount, user.id]);
        db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, target.id]);

        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("💌 송금 완료 💌")
          .setDescription(
            `**보낸 사람**\n${senderNick}\n\n` +
            `**받는 사람**\n<@${target.id}>\n\n` +
            `**송금 금액**\n💰 ${fmt(amount)} 코인`
          )
          .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 64 })); // 받은 사람 프로필 작게

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
      const targetNick = guild.members.cache.get(target.id)?.displayName || target.username;

      if (amount <= 0) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 금액 오류")
          .setDescription("지급 금액은 1 이상이어야 합니다!");
        return interaction.editReply({ embeds: [embed], ephemeral: true });
      }

      db.run("INSERT OR IGNORE INTO users (id, balance, lastDaily) VALUES (?, 0, '')", [target.id]);
      db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, target.id]);

      const embed = new EmbedBuilder()
        .setColor(COLOR_ADMIN)
        .setTitle("💌 관리자 지급 완료 💌")
        .setDescription(
          `**보낸 사람**\n관리자\n\n` +
          `**받은 사람**\n<@${target.id}>\n\n` +
          `**지급 금액**\n💰 ${fmt(amount)} 코인`
        )
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 64 }));

      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    // ======================
    // /대박복권
    // ======================
    else if (commandName === '대박복권') {
      const bet = options.getInteger('금액');
      db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, row) => {
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
        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user.id]);

        let embed;
        if (result === "💎") {
          // 100배 강조 카드
          embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle("✨ 초대박! 100배 당첨! ✨")
            .setDescription(
              `**결과**\n💎 다이아몬드\n\n` +
              `**획득 금액**\n${fmt(payout)} 코인\n\n` +
              `**순이익**\n+${fmt(delta)} 코인\n\n` +
              `**현재 잔액**\n${fmt(newBalance)} 코인`
            )
            .setThumbnail("https://i.imgur.com/yR8M6Xv.png");
        } else {
          // 소박 카드
          embed = new EmbedBuilder()
            .setColor(payout > 0 ? COLOR_SUCCESS : COLOR_ERROR)
            .setTitle(payout > 0 ? `🎰 당첨! x${SLOT_PAYOUTS[result]}` : "❌ 꽝")
            .setDescription(
              payout > 0
                ? `**획득 금액**\n${fmt(payout)} 코인\n\n` +
                  `**순이익**\n${delta >= 0 ? "+" : ""}${fmt(delta)} 코인\n\n` +
                  `**현재 잔액**\n${fmt(newBalance)} 코인`
                : `**손실 금액**\n-${fmt(bet)} 코인\n\n` +
                  `**순이익**\n-${fmt(bet)} 코인\n\n` +
                  `**현재 잔액**\n${fmt(newBalance)} 코인`
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 64 }))
            .setFooter({ text: nick });
        }
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ======================
    // /랭킹
    // ======================
    else if (commandName === '랭킹') {
      const type = options.getString('종류');

      const makeRankLabel = (i) => {
        if (i === 0) return "🥇";
        if (i === 1) return "🥈";
        if (i === 2) return "🥉";
        return `#${i + 1}`;
      };

      if (type === 'server') {
        db.all("SELECT id, balance FROM users WHERE balance > 0 ORDER BY balance DESC LIMIT 10", (err, rows) => {
          if (!rows || rows.length === 0) {
            const embed = new EmbedBuilder()
              .setColor(COLOR_ERROR)
              .setTitle("📉 데이터 없음");
            return interaction.editReply({ embeds: [embed] });
          }

          let rankMsg = rows.map((row, i) => {
            const member = guild.members.cache.get(row.id);
            const name = member?.displayName || row.id;
            return `${makeRankLabel(i)} ${name} — ${fmt(row.balance)} 코인 💰`;
          }).join("\n");

          const embed = new EmbedBuilder()
            .setColor(COLOR_INFO)
            .setTitle(`🏆 ${guild.name} 서버 랭킹`)
            .setDescription(rankMsg);

          interaction.editReply({ embeds: [embed] });
        });
      } else if (type === 'global') {
        db.all("SELECT id, balance FROM users WHERE balance > 0 ORDER BY balance DESC LIMIT 10", (err, rows) => {
          if (!rows || rows.length === 0) {
            const embed = new EmbedBuilder()
              .setColor(COLOR_ERROR)
              .setTitle("📉 데이터 없음");
            return interaction.editReply({ embeds: [embed] });
          }

          let rankMsg = rows.map((row, i) => {
            const member = client.users.cache.get(row.id);
            const name = member?.username || row.id;
            return `${makeRankLabel(i)} ${name} — ${fmt(row.balance)} 코인 💰`;
          }).join("\n");

          const embed = new EmbedBuilder()
            .setColor(COLOR_INFO)
            .setTitle("🏆 전체 랭킹 TOP 10")
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
      const target = options.getUser('유저');

      if (amount < 1 || amount > 100) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 범위 오류")
          .setDescription("1~100개까지만 삭제할 수 있습니다!");
        return interaction.editReply({ embeds: [embed] });
      }

      const channel = interaction.channel;

      if (target) {
        const messages = await channel.messages.fetch({ limit: 100 });
        const userMessages = messages.filter(m => m.author.id === target.id).first(amount);

        for (const msg of userMessages) {
          await msg.delete().catch(() => {});
        }

        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("🧹 청소 완료!")
          .setDescription(
            `**대상 유저**\n${target.username}\n\n` +
            `**삭제된 메시지 수**\n${userMessages.length} 개\n\n` +
            `**요청자**\n${nick}`
          )
          .setThumbnail("https://i.imgur.com/hh4d1ZQ.png");

        return interaction.editReply({ embeds: [embed] });
      } else {
        const messages = await channel.bulkDelete(amount, true);
        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("🧹 청소 완료!")
          .setDescription(
            `**삭제된 메시지 수**\n${messages.size} 개\n\n` +
            `**요청자**\n${nick}`
          )
          .setThumbnail("https://i.imgur.com/hh4d1ZQ.png");

        return interaction.editReply({ embeds: [embed] });
      }
    }

    // ======================
    // /야바위
    // ======================
    else if (commandName === '야바위') {
      const bet = options.getInteger('금액');
      db.get("SELECT balance FROM users WHERE id = ?", [user.id], async (err, row) => {
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
          shuffled.map((_, i) =>
            new ButtonBuilder()
              .setCustomId(`yabawi_${i}_${bet}`)
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
  }

  // ======================
  // 버튼 처리 (야바위)
  // ======================
  if (interaction.isButton() && interaction.customId.startsWith('yabawi')) {
    const [_, index, bet] = interaction.customId.split('_');
    const chosen = parseInt(index);
    const results = ['❌', '❌', '🎉'];
    const result = results[chosen];
    const nick = interaction.guild?.members.cache.get(interaction.user.id)?.displayName || interaction.user.username;

    db.get("SELECT balance FROM users WHERE id = ?", [interaction.user.id], (err, row) => {
      if (!row || row.balance < bet) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR_ERROR)
              .setTitle("❌ 오류")
              .setDescription("잔액이 부족하거나 계정이 없습니다.")
          ],
          ephemeral: true
        });
      }

      let newBalance = row.balance;
      let embed;

      if (result === '🎉') {
        // 3배 강조 카드
        const payout = bet * 3;
        newBalance += (payout - bet);
        embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("🎉 3배 당첨!")
          .setDescription(
            `**획득 금액**\n${fmt(payout)} 코인\n\n` +
            `**순이익**\n+${fmt(payout - bet)} 코인\n\n` +
            `**현재 잔액**\n${fmt(newBalance)} 코인`
          )
          .setThumbnail("https://i.imgur.com/hh4d1ZQ.png");
      } else {
        // 소박 카드
        newBalance -= bet;
        embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle("❌ 꽝")
          .setDescription(
            `**손실 금액**\n-${fmt(bet)} 코인\n\n` +
            `**순이익**\n-${fmt(bet)} 코인\n\n` +
            `**현재 잔액**\n${fmt(newBalance)} 코인`
          )
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 64 }))
          .setFooter({ text: nick });
      }

      db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, interaction.user.id]);
      interaction.update({ embeds: [embed], components: [] });
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
