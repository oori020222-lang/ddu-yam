import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import pkg from 'pg';
const { Pool } = pkg;
import express from 'express';

// ──────────────────────
// Render 우회용 웹서버
// ──────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ──────────────────────
// 디스코드 봇 설정 (DM 관련 없음)
// ──────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// ✅ PostgreSQL 연결
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const fmt = (n) => Number(n).toLocaleString();
const avatar = (guild, uid) =>
  guild?.members.cache.get(uid)?.displayAvatarURL({ extension: 'png', size: 64 }) ||
  client.users.cache.get(uid)?.displayAvatarURL({ extension: 'png', size: 64 });

// DB 초기화
(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      balance INTEGER,
      lastDaily TEXT
    )
  `);
})();

const COLOR_SUCCESS = 0x57f287;
const COLOR_ERROR = 0xed4245;
const COLOR_INFO = 0x3498db;
const COLOR_ADMIN = 0xfee75c;

// 관리자 모드 상태 (기본 OFF)
let adminMode = false;

// ──────────────────────
// 명령어 등록 함수
// ──────────────────────
async function registerCommands(includeAdmin = false) {
  const baseCommands = [
    {
      name: "관리자권한",
      description: "관리자 권한을 토글합니다 (ON ↔ OFF)"
    },
    {
      name: "돈내놔",
      description: "첫 시작 또는 매일 보상 코인 받기"
    },
    {
      name: "잔액",
      description: "내 현재 잔액 확인"
    },
    {
      name: "송금",
      description: "다른 유저에게 코인 송금",
      options: [
        { name: "유저", type: 6, description: "송금할 유저", required: true },
        { name: "금액", type: 4, description: "송금할 금액", required: true }
      ]
    },
    {
      name: "동전던지기",
      description: "코인 앞뒤 맞추기 게임",
      options: [
        { name: "선택", type: 3, description: "앞면 또는 뒷면", required: true, choices: [{ name: "앞면", value: "앞면" }, { name: "뒷면", value: "뒷면" }] },
        { name: "금액", type: 3, description: "베팅 금액 또는 올인", required: true }
      ]
    },
    {
      name: "대박복권",
      description: "복권 게임 (1000 이상 베팅)",
      options: [
        { name: "금액", type: 3, description: "베팅 금액 또는 올인", required: true }
      ]
    },
    {
      name: "야바위",
      description: "야바위 게임 (1000 이상 베팅)",
      options: [
        { name: "금액", type: 3, description: "베팅 금액 또는 올인", required: true }
      ]
    },
    {
      name: "랭킹",
      description: "코인 랭킹 보기",
      options: [
        { name: "종류", type: 3, description: "server 또는 global", required: true, choices: [{ name: "server", value: "server" }, { name: "global", value: "global" }] }
      ]
    },
    {
      name: "청소",
      description: "채팅 청소",
      options: [
        { name: "개수", type: 4, description: "삭제할 메시지 개수 (1~100)", required: true },
        { name: "유저", type: 6, description: "특정 유저 메시지만 삭제", required: false }
      ]
    }
  ];

  if (includeAdmin) {
    baseCommands.push({
      name: "지급",
      description: "관리자가 특정 유저에게 코인 지급",
      options: [
        { name: "유저", type: 6, description: "대상 유저", required: true },
        { name: "금액", type: 4, description: "지급 금액", required: true }
      ]
    });
  }

  await client.application.commands.set(baseCommands);
  console.log("✅ 명령어 등록 완료 (관리자 지급:", includeAdmin ? "ON" : "OFF", ")");
}

client.once('clientReady', async () => {
  console.log(`🤖 ${client.user.tag} 로그인됨`);
  await registerCommands(false); // 시작시 지급 OFF
});

// ──────────────────────
// Slash 명령어 처리
// ──────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  const { commandName, options, user, guild } = interaction;
  const nick = guild?.members.cache.get(user.id)?.displayName || user.username;

// 👉 관리자 전용만 비공개, 나머지는 공개
if (interaction.isChatInputCommand()) {
  if (commandName === '관리자권한' || commandName === '지급') {
    await interaction.deferReply({ flags: 64 }); // 비공개
  } else {
    await interaction.deferReply(); // 공개
  }
}

  // ──────────────────────
  // /관리자권한 (토글)
  // ──────────────────────
  if (commandName === '관리자권한') {
    if (user.id !== process.env.ADMIN_ID) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 권한 없음")
            .setDescription("관리자만 사용할 수 있습니다.")
        ]
      });
    }

    adminMode = !adminMode; // 토글 ON ↔ OFF

    if (adminMode) {
      await registerCommands(true); // 지급 추가
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_SUCCESS)
            .setTitle("✅ 관리자 권한 ON")
            .setDescription("`/지급` 명령어가 활성화되었습니다.")
        ]
      });
    } else {
      await registerCommands(false); // 지급 제거
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 관리자 권한 OFF")
            .setDescription("`/지급` 명령어가 비활성화되었습니다.")
        ]
      });
    }
  }

  // ──────────────────────
  // /지급 (관리자 ON 상태에서만 등록됨)
  // ──────────────────────
  if (commandName === '지급') {
    if (user.id !== process.env.ADMIN_ID) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 권한 없음")
            .setDescription("관리자만 사용할 수 있습니다.")
        ]
      });
    }

    const target = options.getUser('유저');
    const amount = options.getInteger('금액');

    if (!target || amount <= 0) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 지급 실패")
            .setDescription("대상 유저와 금액을 올바르게 입력하세요.")
        ]
      });
    }

    await db.query(
      "INSERT INTO users (id, balance, lastDaily) VALUES ($1, 0, '') ON CONFLICT (id) DO NOTHING",
      [target.id]
    );
    await db.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [amount, target.id]);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_ADMIN)
          .setAuthor({ name: "관리자 지급", iconURL: avatar(guild, user.id) })
          .setTitle("💌 지급 완료 💌")
          .setDescription(
            `**받는 사람**\n<@${target.id}>\n\n` +
            `**지급 금액**\n💰 ${fmt(amount)} 코인`
          )
      ]
    });
  }

  // ──────────────────────
  // /돈내놔 (한국시간 기준)
  // ──────────────────────
  if (commandName === '돈내놔') {
    const now = new Date();
    const today = new Date(now.getTime() + 9 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]; // YYYY-MM-DD (KST)

    const result = await db.query("SELECT balance, lastDaily FROM users WHERE id = $1", [user.id]);
    const row = result.rows[0];

    if (!row) {
      await db.query("INSERT INTO users (id, balance, lastDaily) VALUES ($1, $2, $3)", [user.id, 20000, today]);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ADMIN)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("🎉 첫 보상 지급 완료! 🎉")
            .setDescription("💰 20,000 코인 지급!")
        ]
      });
    }

    if (row.lastdaily === today) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("⏳ 이미 받음")
            .setDescription("오늘은 이미 돈을 받았습니다. 내일 00:00 이후 다시 시도하세요!")
        ]
      });
    }

    const newBalance = row.balance + 20000;
    await db.query("UPDATE users SET balance = $1, lastDaily = $2 WHERE id = $3", [newBalance, today, user.id]);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
          .setTitle("💸 돈 지급 완료!")
          .setDescription(`잔액: ${fmt(newBalance)} 코인`)
      ]
    });
  }

  // ──────────────────────
  // /잔액
  // ──────────────────────
  if (commandName === '잔액') {
    const result = await db.query("SELECT balance FROM users WHERE id = $1", [user.id]);
    const row = result.rows[0];

    if (!row) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 계정 없음")
            .setDescription("아직 돈을 받은 적이 없습니다! `/돈내놔`로 시작하세요.")
        ]
      });
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
          .setTitle("💰 현재 잔액")
          .setDescription(`${fmt(row.balance)} 코인 💰`)
      ]
    });
  }

  // ──────────────────────
  // /송금
  // ──────────────────────
  if (commandName === '송금') {
    const target = options.getUser('유저');
    const amount = options.getInteger('금액');

    if (!target || amount <= 0 || user.id === target.id) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: `보낸 사람: ${nick}`, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 송금 불가")
            .setDescription("자기 자신에게는 송금할 수 없고 금액은 1 이상이어야 합니다.")
        ]
      });
    }

    const senderRes = await db.query("SELECT balance FROM users WHERE id = $1", [user.id]);
    const senderRow = senderRes.rows[0];

    if (!senderRow || senderRow.balance < amount) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: `보낸 사람: ${nick}`, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 실패")
            .setDescription("잔액 부족 또는 계정 없음")
        ]
      });
    }

    await db.query(
      "INSERT INTO users (id, balance, lastDaily) VALUES ($1, 0, '') ON CONFLICT (id) DO NOTHING",
      [target.id]
    );
    await db.query("UPDATE users SET balance = balance - $1 WHERE id = $2", [amount, user.id]);
    await db.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [amount, target.id]);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setAuthor({ name: `보낸 사람: ${nick}`, iconURL: avatar(guild, user.id) })
          .setTitle("💌 송금 완료 💌")
          .setDescription(
            `**받는 사람**\n<@${target.id}>\n\n` +
            `**송금 금액**\n💰 ${fmt(amount)} 코인`
          )
      ]
    });
  }

  // ──────────────────────
  // /동전던지기 (올인 지원)
  // ──────────────────────
  if (commandName === '동전던지기') {
    const side = options.getString('선택');
    const betInput = options.getString('금액');

    const res = await db.query("SELECT balance FROM users WHERE id = $1", [user.id]);
    const row = res.rows[0];

    if (!row) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 실패")
            .setDescription("계정이 없습니다. `/돈내놔`로 시작하세요!")
        ]
      });
    }

    let bet = (betInput === "올인") ? row.balance : parseInt(betInput, 10);
    if (!Number.isFinite(bet) || bet <= 0 || row.balance < bet) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 실패")
            .setDescription("잔액 부족 혹은 금액 오류입니다.")
        ]
      });
    }

    const result = Math.random() < 0.5 ? '앞면' : '뒷면';
    let newBalance = row.balance;
    let embed;

    if (result === side) {
      newBalance += bet;
      embed = new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
        .setDescription(`${result} 승리 🎉 +${fmt(bet)} 코인\n${nick} | 잔액 ${fmt(newBalance)} 코인`);
    } else {
      newBalance -= bet;
      embed = new EmbedBuilder()
        .setColor(COLOR_ERROR)
        .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
        .setDescription(`${result} 패배 ❌ -${fmt(bet)} 코인\n${nick} | 잔액 ${fmt(newBalance)} 코인`);
    }

    await db.query("UPDATE users SET balance = $1 WHERE id = $2", [newBalance, user.id]);
    return interaction.editReply({ embeds: [embed] });
  }

  // ──────────────────────
  // /대박복권 (올인 지원)
  // ──────────────────────
  if (commandName === '대박복권') {
    const betInput = options.getString('금액');
    const res = await db.query("SELECT balance FROM users WHERE id = $1", [user.id]);
    const row = res.rows[0];

    if (!row) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 실패")
            .setDescription("계정이 없습니다. `/돈내놔`로 시작하세요!")
        ]
      });
    }

    let bet = (betInput === "올인") ? row.balance : parseInt(betInput, 10);
    if (!Number.isFinite(bet) || bet < 1000 || row.balance < bet) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 실패")
            .setDescription("잔액 부족 또는 최소 베팅(1000) 이상이어야 합니다.")
        ]
      });
    }

    const SYMBOLS = ["🥚", "🐣", "🐥", "🐔", "🍗", "💎"];
    const WEIGHTS = [34.9, 30, 20, 10, 5, 0.1];
    const PAYOUTS = { "🐣": 2, "🐥": 3, "🐔": 5, "🍗": 10, "💎": 100 };

    const r = Math.random() * 100;
    let sum = 0, result = "🥚";
    for (let i = 0; i < SYMBOLS.length; i++) {
      sum += WEIGHTS[i];
      if (r < sum) { result = SYMBOLS[i]; break; }
    }

    const payout = PAYOUTS[result] ? bet * PAYOUTS[result] : 0;
    const newBal = row.balance + (payout - bet);
    await db.query("UPDATE users SET balance = $1 WHERE id = $2", [newBal, user.id]);

    let embed;
    if (result === "💎") {
      embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
        .setDescription(`${result} 초대박! x100배 ✨ +${fmt(payout)} 코인\n${nick} | 잔액 ${fmt(newBal)} 코인`);
    } else if (payout > 0) {
      embed = new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
        .setDescription(`${result} 당첨! x${PAYOUTS[result]}배 🎰 +${fmt(payout)} 코인\n${nick} | 잔액 ${fmt(newBal)} 코인`);
    } else {
      embed = new EmbedBuilder()
        .setColor(COLOR_ERROR)
        .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
        .setDescription(`${result} 꽝 ❌ -${fmt(bet)} 코인\n${nick} | 잔액 ${fmt(newBal)} 코인`);
    }

    return interaction.editReply({ embeds: [embed] });
  }

 // ──────────────────────
// 야바위 (올인 지원)
// ──────────────────────
if (commandName === '야바위') {
  const betInput = options.getString('금액');
  const res = await db.query("SELECT balance FROM users WHERE id = $1", [user.id]);
  const row = res.rows[0];
  if (!row) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 실패").setDescription("계정이 없습니다. `/돈내놔`로 시작하세요!")]
    });
  }

  let bet = (betInput === "올인") ? row.balance : parseInt(betInput, 10);
  if (!Number.isFinite(bet) || bet < 1000 || row.balance < bet) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 실패").setDescription("잔액 부족 또는 최소 베팅(1000) 이상이어야 합니다.")]
    });
  }

  const cards = ['❌', '❌', '🎉'];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  const rowButtons = new ActionRowBuilder().addComponents(
    cards.map((_, i) =>
      new ButtonBuilder()
        .setCustomId(`yabawi_${i}_${cards.join('')}_${bet}`)
        .setLabel(`카드 ${i + 1}`)
        .setStyle(ButtonStyle.Primary)
    )
  );

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR_INFO)
        .setTitle("🎲 야바위 게임")
        .setDescription("3장의 카드 중 하나를 선택하세요!") // ❌ 물음표 제거
    ],
    components: [rowButtons]
  });
}

  // ──────────────────────
  // /랭킹 (서버/전체)
  // ──────────────────────
  if (commandName === '랭킹') {
    const type = options.getString('종류');
    const res = await db.query("SELECT id, balance FROM users ORDER BY balance DESC LIMIT 10");
    const rows = res.rows;

    if (!rows || rows.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("📉 데이터 없음")]
      });
    }

    if (type === 'server') {
      let rankMsg = rows.map((row, i) => {
        const member = guild.members.cache.get(row.id);
        const name = member?.displayName || row.id;
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `🏅 #${i + 1}`;
        return `${medal} ${name} — ${fmt(row.balance)} 코인`;
      }).join("\n");

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_INFO)
            .setTitle(`⭐ ${guild.name} 서버 랭킹`)
            .setDescription(rankMsg)
        ]
      });
    }

    if (type === 'global') {
      let rankMsg = rows.map((row, i) => {
        const member = client.users.cache.get(row.id);
        const name = member?.username || row.id;
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `🏅 #${i + 1}`;
        return `${medal} ${name} — ${fmt(row.balance)} 코인`;
      }).join("\n");

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_INFO)
            .setTitle("🏆 전체 서버 랭킹")
            .setDescription(rankMsg)
        ]
      });
    }
  }

  // ──────────────────────
  // /청소
  // ──────────────────────
  if (commandName === '청소') {
    const amount = options.getInteger('개수');
    const target = options.getUser('유저');

    if (amount < 1 || amount > 100) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("❌ 범위 오류")
            .setDescription("1~100개까지만 삭제할 수 있습니다!")
        ]
      });
    }

    const channel = interaction.channel;

    if (target) {
      const messages = await channel.messages.fetch({ limit: 100 });
      const userMessages = messages.filter(m => m.author.id === target.id).first(amount);

      for (const msg of userMessages) {
        await msg.delete().catch(() => {});
      }

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_SUCCESS)
            .setTitle("🧹 청소 완료!")
            .setDescription(`**대상 유저**\n${target.username}\n\n**삭제된 메시지 수**\n${userMessages.length} 개`)
        ]
      });
    } else {
      const messages = await channel.bulkDelete(amount, true);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_SUCCESS)
            .setTitle("🧹 청소 완료!")
            .setDescription(`**삭제된 메시지 수**\n${messages.size} 개`)
        ]
      });
    }
  }
});

// ──────────────────────
// 버튼 처리 (야바위)
// ──────────────────────
if (interaction.isButton() && interaction.customId.startsWith('yabawi')) {
  const [_, index, cardString, bet] = interaction.customId.split('_');
  const chosen = parseInt(index);
  const wager = parseInt(bet);
  const cards = cardString.split('');

  const res = await db.query("SELECT balance FROM users WHERE id = $1", [interaction.user.id]);
  const row = res.rows[0];
  if (!row || row.balance < wager) {
    return await interaction.reply({
      embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 오류").setDescription("잔액이 부족하거나 계정이 없습니다.")],
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
      .setTitle("🎉 승리!")
      .setDescription(
        `선택: 카드 ${chosen + 1} → ${pickedCard}\n\n` +
        `모든 카드:\n1번: ${cards[0]} | 2번: ${cards[1]} | 3번: ${cards[2]}\n\n` +
        `+${fmt(payout)} 코인 획득!\n잔액: ${fmt(newBal)} 코인`
      );
  } else {
    newBal -= wager;
    embed = new EmbedBuilder()
      .setColor(COLOR_ERROR)
      .setTitle("❌ 패배")
      .setDescription(
        `선택: 카드 ${chosen + 1} → ${pickedCard}\n\n` +
        `모든 카드:\n1번: ${cards[0]} | 2번: ${cards[1]} | 3번: ${cards[2]}\n\n` +
        `-${fmt(wager)} 코인 손실...\n잔액: ${fmt(newBal)} 코인`
      );
  }

  await db.query("UPDATE users SET balance = $1 WHERE id = $2", [newBal, interaction.user.id]);

  await interaction.update({ embeds: [embed], components: [] });
}

// ──────────────────────
// 마지막: 로그인
// ──────────────────────
client.login(process.env.DISCORD_TOKEN);
