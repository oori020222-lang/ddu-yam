import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { ChannelType } from 'discord.js';   // ✅ DM 체크용
import sqlite3 from 'sqlite3';
import express from 'express';

// ──────────────────────
// Render 우회용 웹서버
// ──────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ──────────────────────
// 디스코드 봇 설정
// ──────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
const db = new sqlite3.Database('./database.db');
const fmt = (n) => Number(n).toLocaleString();

// 유저 아바타
const avatar = (guild, uid) =>
  guild.members.cache.get(uid)?.displayAvatarURL({ extension: 'png', size: 64 }) ||
  client.users.cache.get(uid)?.displayAvatarURL({ extension: 'png', size: 64 });

// DB 초기화 (서버 구분 없음)
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    balance INTEGER,
    lastDaily TEXT
  )
`);

// 색상
const COLOR_SUCCESS = 0x57f287;
const COLOR_ERROR = 0xed4245;
const COLOR_INFO = 0x3498db;
const COLOR_ADMIN = 0xfee75c;

client.once('ready', () => {
  console.log(`🤖 ${client.user.tag}로 로그인함`);
});

// ──────────────────────
// DM 관리자 지급 (Slash 명령어 등록 X)
// ──────────────────────
client.on('messageCreate', async (msg) => {
  if (msg.author.id !== process.env.ADMIN_ID) return; // 관리자만
  if (msg.channel.type !== ChannelType.DM) return; // DM에서만 실행

  const parts = msg.content.trim().split(/\s+/);
  if (parts[0] === "지급" && parts.length === 3) {
    const mention = parts[1].replace(/[<@!>]/g, "");
    const amount = parseInt(parts[2], 10);

    if (!Number.isFinite(amount) || amount <= 0) {
      return msg.reply("❌ 금액은 1 이상이어야 합니다.");
    }

    db.run("INSERT OR IGNORE INTO users (id, balance, lastDaily) VALUES (?, 0, '')", [mention]);
    db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, mention]);

    const userObj = await client.users.fetch(mention).catch(() => null);
    const name = userObj?.username || mention;

    const embed = new EmbedBuilder()
      .setColor(COLOR_ADMIN)
      .setAuthor({ name: "관리자 지급", iconURL: msg.author.displayAvatarURL() })
      .setTitle("💌 지급 완료 💌")
      .setDescription(
        `**받는 사람**\n<@${mention}>\n\n` +
        `**지급 금액**\n💰 ${fmt(amount)} 코인`
      );

    msg.reply({ embeds: [embed] });
  }
});

// ──────────────────────
// Slash 명령어 (돈내놔, 잔액, 송금, 동전던지기, 대박복권, 야바위, 랭킹, 청소)
// ──────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  const { commandName, options, user, guild } = interaction;
  const nick = guild.members.cache.get(user.id)?.displayName || user.username;

  if (interaction.isChatInputCommand()) {
    await interaction.deferReply();

    // ──────────────────────
    // 돈내놔
    // ──────────────────────
    if (commandName === '돈내놔') {
      const today = new Date().toDateString();
      db.get("SELECT balance, lastDaily FROM users WHERE id = ?", [user.id], (err, row) => {
        if (!row) {
          db.run("INSERT INTO users (id, balance, lastDaily) VALUES (?, 20000, ?)", [user.id, today]);
          const embed = new EmbedBuilder()
            .setColor(0xfee75c)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("🎉 첫 보상 지급 완료! 🎉")
            .setDescription(
              `**지급된 코인**\n💰 20,000 코인\n\n` +
              `**시작 안내**\n✨ 오늘부터 코인 게임을 즐겨보세요!`
            );
          return interaction.editReply({ embeds: [embed] });
        }

        if (row.lastDaily === today) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("⏳ 이미 받음")
            .setDescription("오늘은 이미 돈을 받았습니다. 내일 다시 시도해주세요!");
          return interaction.editReply({ embeds: [embed] });
        }

        const newBalance = row.balance + 20000;
        db.run("UPDATE users SET balance = ?, lastDaily = ? WHERE id = ?", [newBalance, today, user.id]);

        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
          .setTitle("💸 돈 지급 완료!")
          .setDescription(
            `**지급 금액**\n💰 20,000 코인\n\n` +
            `**현재 잔액**\n${fmt(newBalance)} 코인`
          );
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ──────────────────────
    // 잔액
    // ──────────────────────
    else if (commandName === '잔액') {
      db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, row) => {
        if (!row) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 계정 없음")
            .setDescription("아직 돈을 받은 적이 없습니다! `/돈내놔`로 시작하세요.");
          return interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
          .setTitle("💰 현재 잔액")
          .setDescription(`${fmt(row.balance)} 코인 💰`);

        interaction.editReply({ embeds: [embed] });
      });
    }

    // ──────────────────────
    // 송금
    // ──────────────────────
    else if (commandName === '송금') {
      const target = options.getUser('유저');
      const amount = options.getInteger('금액');
      if (!target || amount <= 0 || user.id === target.id) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setAuthor({ name: `보낸 사람: ${nick}`, iconURL: avatar(guild, user.id) })
          .setTitle("❌ 송금 불가")
          .setDescription("자기 자신에게는 송금할 수 없고 금액은 1 이상이어야 합니다.");
        return interaction.editReply({ embeds: [embed] });
      }

      db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, senderRow) => {
        if (!senderRow || senderRow.balance < amount) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: `보낸 사람: ${nick}`, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 실패")
            .setDescription("잔액 부족 또는 계정 없음");
          return interaction.editReply({ embeds: [embed] });
        }

        db.run("INSERT OR IGNORE INTO users (id, balance, lastDaily) VALUES (?, 0, '')", [target.id]);
        db.run("UPDATE users SET balance = balance - ? WHERE id = ?", [amount, user.id]);
        db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, target.id]);

        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setAuthor({ name: `보낸 사람: ${nick}`, iconURL: avatar(guild, user.id) })
          .setTitle("💌 송금 완료 💌")
          .setDescription(
            `**받는 사람**\n<@${target.id}>\n\n` +
            `**송금 금액**\n💰 ${fmt(amount)} 코인`
          );
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ──────────────────────
    // 동전던지기 (올인 지원)
    // ──────────────────────
    else if (commandName === '동전던지기') {
      const side = options.getString('선택');
      const betInput = options.getString('금액');

      db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, row) => {
        if (!row) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 실패")
            .setDescription("계정이 없습니다. `/돈내놔`로 시작하세요!");
          return interaction.editReply({ embeds: [embed] });
        }

        let bet = (betInput === "올인") ? row.balance : parseInt(betInput, 10);
        if (!Number.isFinite(bet) || bet <= 0 || row.balance < bet) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 실패")
            .setDescription("잔액 부족 혹은 금액 오류입니다.");
          return interaction.editReply({ embeds: [embed] });
        }

        const result = Math.random() < 0.5 ? '앞면' : '뒷면';
        let newBalance = row.balance;
        let embed;

       if (result === side) {
  newBalance += bet;
  embed = new EmbedBuilder()
    .setColor(COLOR_SUCCESS)
    .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
    .setDescription(
      `${result} 승리 🎉 +${fmt(bet)} 코인\n` +
      `${nick} | 잔액 ${fmt(newBalance)} 코인`
    );
} else {
  newBalance -= bet;
  embed = new EmbedBuilder()
    .setColor(COLOR_ERROR)
    .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
    .setDescription(
      `${result} 패배 ❌ -${fmt(bet)} 코인\n` +
      `${nick} | 잔액 ${fmt(newBalance)} 코인`
    );
}

        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user.id]);
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ──────────────────────
    // 대박복권 (올인 지원)
    // ──────────────────────
    else if (commandName === '대박복권') {
      const betInput = options.getString('금액');

      db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, row) => {
        if (!row) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 실패")
            .setDescription("계정이 없습니다. `/돈내놔`로 시작하세요!");
          return interaction.editReply({ embeds: [embed] });
        }

        let bet = (betInput === "올인") ? row.balance : parseInt(betInput, 10);
        if (!Number.isFinite(bet) || bet < 1000 || row.balance < bet) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 실패")
            .setDescription("잔액 부족 또는 최소 베팅(1000) 이상이어야 합니다.");
          return interaction.editReply({ embeds: [embed] });
        }

        const SYMBOLS  = ["🥚", "🐣", "🐥", "🐔", "🍗", "💎"];
        const WEIGHTS  = [34.9, 30, 20, 10, 5, 0.1];
        const PAYOUTS  = { "🐣": 2, "🐥": 3, "🐔": 5, "🍗": 10, "💎": 100 };

        const r = Math.random() * 100;
        let sum = 0, result = "🥚";
        for (let i = 0; i < SYMBOLS.length; i++) {
          sum += WEIGHTS[i];
          if (r < sum) { result = SYMBOLS[i]; break; }
        }

        const payout = PAYOUTS[result] ? bet * PAYOUTS[result] : 0;
        const newBal = row.balance + (payout - bet);
        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBal, user.id]);

        let embed;
       if (result === "💎") {
  embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
    .setDescription(
      `${result} 초대박! x100배 ✨ +${fmt(payout)} 코인\n` +
      `${nick} | 잔액 ${fmt(newBal)} 코인`
    );
} else if (payout > 0) {
  embed = new EmbedBuilder()
    .setColor(COLOR_SUCCESS)
    .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
    .setDescription(
      `${result} 당첨! x${PAYOUTS[result]}배 🎰 +${fmt(payout)} 코인\n` +
      `${nick} | 잔액 ${fmt(newBal)} 코인`
    );
} else {
  embed = new EmbedBuilder()
    .setColor(COLOR_ERROR)
    .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
    .setDescription(
      `${result} 꽝 ❌ -${fmt(bet)} 코인\n` +
      `${nick} | 잔액 ${fmt(newBal)} 코인`
    );
}
        interaction.editReply({ embeds: [embed] });
      });
    }

// ──────────────────────
// 야바위 (올인 지원)
// ──────────────────────
else if (commandName === '야바위') {
  const betInput = options.getString('금액');
  db.get("SELECT balance FROM users WHERE id = ?", [user.id], async (err, row) => {
    if (!row) {
      const embed = new EmbedBuilder()
        .setColor(COLOR_ERROR)
        .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
        .setTitle("❌ 실패")
        .setDescription("계정이 없습니다. `/돈내놔`로 시작하세요!");
      return interaction.editReply({ embeds: [embed] });
    }

    let bet = (betInput === "올인") ? row.balance : parseInt(betInput, 10);
    if (!Number.isFinite(bet) || bet < 1000 || row.balance < bet) {
      const embed = new EmbedBuilder()
        .setColor(COLOR_ERROR)
        .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
        .setTitle("❌ 베팅 실패")
        .setDescription("잔액 부족 또는 최소 베팅(1000) 이상이어야 합니다.");
      return interaction.editReply({ embeds: [embed] });
    }

    // 카드 섞기
    const cards = ['❌', '❌', '🎉'];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    // 버튼 생성 (카드 배열 전체를 customId에 저장)
    const rowButtons = new ActionRowBuilder().addComponents(
      cards.map((card, i) =>
        new ButtonBuilder()
          .setCustomId(`yabawi_${i}_${cards.join('')}_${bet}`)
          .setLabel(`카드 ${i + 1}`)
          .setStyle(ButtonStyle.Primary)
      )
    );

    // 처음엔 전부 ❓로만 보여주기
    const embed = new EmbedBuilder()
      .setColor(COLOR_INFO)
      .setTitle("🎲 야바위 게임")
      .setDescription("3장의 카드 중 하나를 선택하세요!\n\n❓ | ❓ | ❓");

    interaction.editReply({ embeds: [embed], components: [rowButtons] });
  });
}

    // ──────────────────────
    // 랭킹 (서버/전체)
    // ──────────────────────
    else if (commandName === '랭킹') {
      const type = options.getString('종류');

      if (type === 'server') {
        db.all("SELECT id, balance FROM users ORDER BY balance DESC LIMIT 10", (err, rows) => {
          if (!rows || rows.length === 0) {
            const embed = new EmbedBuilder()
              .setColor(COLOR_ERROR)
              .setTitle("📉 데이터 없음");
            return interaction.editReply({ embeds: [embed] });
          }

          let rankMsg = rows.map((row, i) => {
            const member = guild.members.cache.get(row.id);
            const name = member?.displayName || row.id;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `🏅 #${i + 1}`;
            return `${medal} ${name} — ${fmt(row.balance)} 코인`;
          }).join("\n");

          const embed = new EmbedBuilder()
            .setColor(COLOR_INFO)
            .setTitle(`⭐ ${guild.name} 서버 랭킹`)
            .setDescription(rankMsg);

          interaction.editReply({ embeds: [embed] });
        });
      }

      else if (type === 'global') {
        db.all("SELECT id, balance FROM users ORDER BY balance DESC LIMIT 10", (err, rows) => {
          if (!rows || rows.length === 0) {
            const embed = new EmbedBuilder()
              .setColor(COLOR_ERROR)
              .setTitle("📉 데이터 없음");
            return interaction.editReply({ embeds: [embed] });
          }

          let rankMsg = rows.map((row, i) => {
            const member = client.users.cache.get(row.id);
            const name = member?.username || row.id;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `🏅 #${i + 1}`;
            return `${medal} ${name} — ${fmt(row.balance)} 코인`;
          }).join("\n");

          const embed = new EmbedBuilder()
            .setColor(COLOR_INFO)
            .setTitle("🏆 전체 서버 랭킹")
            .setDescription(rankMsg);

          interaction.editReply({ embeds: [embed] });
        });
      }
    }

    // ──────────────────────
    // 청소
    // ──────────────────────
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
            `**삭제된 메시지 수**\n${userMessages.length} 개`
          );
        return interaction.editReply({ embeds: [embed] });
      } else {
        const messages = await channel.bulkDelete(amount, true);

        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("🧹 청소 완료!")
          .setDescription(`**삭제된 메시지 수**\n${messages.size} 개`);
        return interaction.editReply({ embeds: [embed] });
      }
    }
  }

// ──────────────────────
// 버튼 처리 (야바위)
// ──────────────────────
if (interaction.isButton() && interaction.customId.startsWith('yabawi')) {
  const [_, index, cardString, bet] = interaction.customId.split('_');
  const chosen = parseInt(index);
  const wager = parseInt(bet);
  const cards = cardString.split('');

  db.get("SELECT balance FROM users WHERE id = ?", [interaction.user.id], (err, row) => {
    if (!row || row.balance < wager) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setTitle("❌ 오류")
            .setDescription("잔액이 부족하거나 계정이 없습니다.")
        ],
        ephemeral: true
      });
    }

    let newBal = row.balance;
    const pickedCard = cards[chosen];
    let embed;

    if (pickedCard === '🎉') {
      const payout = wager * 3;
      newBal += (payout - wager);
      embed = new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTitle("🎉 승리!")
        .setDescription(
          `당신이 선택한 카드: **카드 ${chosen + 1} → ${pickedCard}**\n\n` +
          `모든 카드:\n${cards.map((c, i) => `${i+1}번: ${c}`).join(" | ")}\n\n` +
          `+${fmt(payout)} 코인 획득!\n` +
          `잔액: ${fmt(newBal)} 코인`
        );
    } else {
      newBal -= wager;
      embed = new EmbedBuilder()
        .setColor(COLOR_ERROR)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTitle("❌ 패배")
        .setDescription(
          `당신이 선택한 카드: **카드 ${chosen + 1} → ${pickedCard}**\n\n` +
          `모든 카드:\n${cards.map((c, i) => `${i+1}번: ${c}`).join(" | ")}\n\n` +
          `-${fmt(wager)} 코인 손실...\n` +
          `잔액: ${fmt(newBal)} 코인`
        );
    }
 
db.run("UPDATE users SET balance = ? WHERE id = ?", [newBal, interaction.user.id]);

    // ❓ → 실제 카드로 뒤집는 느낌 연출
    interaction.update({ 
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setTitle("🔄 카드 뒤집는 중...")
          .setDescription("❓ | ❓ | ❓")
      ], 
      components: [] 
    }).then(() => {
      setTimeout(() => {
        interaction.editReply({ embeds: [embed] });
      }, 1500); // 1.5초 뒤 결과 공개
    });
  });
}

client.login(process.env.DISCORD_TOKEN);
