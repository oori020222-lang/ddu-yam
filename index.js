// ──────────────────────
// 환경설정 로드
// ──────────────────────
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
/* Render 우회용 웹서버 */
// ──────────────────────
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ──────────────────────
// 디스코드 클라이언트
// ──────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// ──────────────────────
// PostgreSQL 연결
// ──────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ──────────────────────
// 유틸리티
// ──────────────────────
const toNum = (v) => Number(v ?? 0) || 0; // BIGINT 문자열 → Number
const toStr = (v) => (v ?? '').toString();
const fmt = (n) => Number(n).toLocaleString();
const avatar = (guild, uid) =>
  guild?.members.cache.get(uid)?.displayAvatarURL({ extension: 'png', size: 64 }) ||
  client.users.cache.get(uid)?.displayAvatarURL({ extension: 'png', size: 64 });

const COLOR_SUCCESS = 0x57f287;
const COLOR_ERROR = 0xed4245;
const COLOR_INFO = 0x3498db;
const COLOR_ADMIN = 0xfee75c;

// ──────────────────────
// DB 초기화 (balance BIGINT)
// ──────────────────────
(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      balance BIGINT,
      lastDaily TEXT
    )
  `);
})();

// ──────────────────────
// 상태값
// ──────────────────────
let adminMode = false;

// ──────────────────────
// Slash 명령어 등록
// adminMode가 true면 지급/초기화 포함
// ──────────────────────
async function registerCommands(includeAdmin = false) {
  const baseCommands = [
    { name: "관리자권한", description: "관리자 권한 토글 (ON/OFF)" },
    { name: "돈내놔", description: "첫 시작 또는 매일 보상 코인 받기" },
    { name: "잔액", description: "내 잔액 확인" },
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
      description: "코인 앞뒤 맞추기",
      options: [
        { name: "선택", type: 3, description: "앞면/뒷면", required: true, choices: [{ name: "앞면", value: "앞면" }, { name: "뒷면", value: "뒷면" }] },
        { name: "금액", type: 3, description: "베팅 금액 또는 올인", required: true }
      ]
    },
    {
      name: "대박복권",
      description: "복권 게임 (1000 이상)",
      options: [{ name: "금액", type: 3, description: "베팅 금액 또는 올인", required: true }]
    },
    {
      name: "야바위",
      description: "야바위 게임 (1000 이상)",
      options: [{ name: "금액", type: 3, description: "베팅 금액 또는 올인", required: true }]
    },
    {
      name: "랭킹",
      description: "코인 랭킹",
      options: [
        {
          name: "종류", type: 3, description: "server/global", required: true,
          choices: [{ name: "서버", value: "server" }, { name: "전체", value: "global" }]
        }
      ]
    },
    {
      name: "청소",
      description: "채팅 청소",
      options: [
        { name: "개수", type: 4, description: "삭제 개수 (1~100)", required: true },
        { name: "유저", type: 6, description: "특정 유저만", required: false }
      ]
    }
  ];

  if (includeAdmin) {
    baseCommands.push({
      name: "지급",
      description: "관리자가 유저에게 코인 지급",
      options: [
        { name: "유저", type: 6, description: "대상 유저", required: true },
        { name: "금액", type: 4, description: "코인 금액", required: true }
      ]
    });
    baseCommands.push({
      name: "초기화",
      description: "관리자가 특정 유저 데이터 초기화",
      options: [
        { name: "유저", type: 6, description: "대상 유저", required: true },
        {
          name: "항목", type: 3, description: "초기화 범위",
          required: false,
          choices: [
            { name: "잔액", value: "잔액" },
            { name: "보상", value: "보상" },
            { name: "전체", value: "전체" }
          ]
        }
      ]
    });
  }

  await client.application.commands.set(baseCommands);
  console.log("✅ 명령어 등록 완료 (관리자 기능:", includeAdmin ? "ON" : "OFF", ")");
}

// ──────────────────────
// 봇 준비 완료
// ──────────────────────
client.once('ready', async () => {
  console.log(`🤖 ${client.user.tag} 로그인됨`);
  await registerCommands(false);
});

// ──────────────────────
// 상호작용 처리
// ──────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    const { commandName, options, user, guild } = interaction;
    const nick = guild?.members.cache.get(user.id)?.displayName || user.username;

    // ✅ 관리자 관련만 비공개, 나머지는 공개
    if (interaction.isChatInputCommand()) {
      const adminOnlyCmds = ['관리자권한', '지급', '초기화'];
      if (adminOnlyCmds.includes(commandName)) {
        await interaction.deferReply({ ephemeral: true });
      } else {
        await interaction.deferReply({ ephemeral: false });
      }
    }

    // ──────────────────────
    // /관리자권한 (토글)
    // ──────────────────────
    if (commandName === '관리자권한') {
      if (user.id !== process.env.ADMIN_ID) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 권한 없음").setDescription("관리자만 사용 가능")]
        });
      }
      adminMode = !adminMode;
      if (adminMode) {
        await registerCommands(true);
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle("✅ 관리자 권한 ON").setDescription("/지급, /초기화 명령어 활성화")]
        });
      } else {
        await registerCommands(false);
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 관리자 권한 OFF").setDescription("/지급, /초기화 명령어 비활성화")]
        });
      }
    }

    // ──────────────────────
    // /지급 (관리자만, 토글 ON일 때만 노출)
    // ──────────────────────
    if (commandName === '지급') {
      if (user.id !== process.env.ADMIN_ID) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 권한 없음").setDescription("관리자만 사용할 수 있습니다.")]
        });
      }
      const target = options.getUser('유저');
      const amount = toNum(options.getInteger('금액'));
      if (!target || amount <= 0) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 지급 실패").setDescription("대상 유저와 금액을 올바르게 입력하세요.")]
        });
      }
      await db.query("INSERT INTO users (id, balance, lastDaily) VALUES ($1, 0, '') ON CONFLICT (id) DO NOTHING", [target.id]);
      await db.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [amount, target.id]);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR_ADMIN)
          .setTitle("💌 지급 완료 💌")
          .setDescription(`**받는 사람**\n<@${target.id}>`)
          .setFooter({ text: `${target.username} ｜ 💰 ${fmt(amount)} 코인`, iconURL: avatar(guild, target.id) })]
      });
    }

    // ──────────────────────
    // /초기화 (관리자만, 토글 ON일 때만 노출)
    // ──────────────────────
    if (commandName === '초기화') {
      if (user.id !== process.env.ADMIN_ID) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 권한 없음").setDescription("관리자만 사용할 수 있습니다.")]
        });
      }

      const target = options.getUser('유저');
      const scope = options.getString('항목') || '전체';

      if (!target) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 초기화 실패").setDescription("대상 유저를 올바르게 입력하세요.")]
        });
      }

      await db.query("INSERT INTO users (id, balance, lastDaily) VALUES ($1, 0, '') ON CONFLICT (id) DO NOTHING", [target.id]);

      if (scope === '잔액') {
        await db.query("UPDATE users SET balance = 0 WHERE id = $1", [target.id]);
      } else if (scope === '보상') {
        await db.query("UPDATE users SET lastDaily = '' WHERE id = $1", [target.id]);
      } else {
        await db.query("UPDATE users SET balance = 0, lastDaily = '' WHERE id = $1", [target.id]);
      }

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR_ADMIN)
          .setTitle("🧹 초기화 완료")
          .setDescription(`**대상**\n<@${target.id}>\n**항목**\n${scope}`)
          .setFooter({ text: `${target.username} ｜ 초기화 적용`, iconURL: avatar(guild, target.id) })]
      });
    }

    // ──────────────────────
    // 돈내놔 (KST 00:00 리셋)
    // ──────────────────────
    if (commandName === '돈내놔') {
      const now = new Date();
      const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

      const result = await db.query("SELECT balance, lastDaily FROM users WHERE id = $1", [user.id]);
      const row = result.rows[0];

      if (!row) {
        const firstBalance = 20000;
        await db.query("INSERT INTO users (id, balance, lastDaily) VALUES ($1, $2, $3)", [user.id, firstBalance, today]);
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLOR_ADMIN).setTitle("🎉 첫 보상 지급 완료! 🎉")
            .setDescription(`지급된 코인\n💰 ${fmt(firstBalance)} 코인\n\n시작 안내\n✨ 오늘부터 코인 게임을 즐겨보세요!`)
            .setFooter({ text: `${nick} ｜ ${fmt(firstBalance)} 코인`, iconURL: avatar(guild, user.id) })]
        });
      }

      const balance = toNum(row.balance);
      const lastDaily = toStr(row.lastdaily || row.lastDaily);

      if (lastDaily === today) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("⏳ 이미 받음").setDescription("오늘은 이미 돈을 받았습니다. 내일 00:00 이후 다시 시도하세요!")] });
      }

      const newBalance = balance + 20000;
      await db.query("UPDATE users SET balance = $1, lastDaily = $2 WHERE id = $3", [newBalance, today, user.id]);

      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle("🎉 오늘 지급 완료! 🎉")
          .setDescription(`지급된 코인\n💰 20,000 코인\n\n시작 안내\n✨ 코인 게임을 즐겨보세요!`)
          .setFooter({ text: `${nick} ｜ ${fmt(newBalance)} 코인`, iconURL: avatar(guild, user.id) })]
      });
    }

    // ──────────────────────
    // 잔액
    // ──────────────────────
    if (commandName === '잔액') {
      const result = await db.query("SELECT balance FROM users WHERE id = $1", [user.id]);
      const row = result.rows[0];
      if (!row) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 계정 없음").setDescription("아직 돈을 받은 적이 없습니다! `/돈내놔`로 시작하세요.")] });
      }
      const balance = toNum(row.balance);
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_INFO).setTitle("💰 현재 잔액 💰")
          .setFooter({ text: `${nick} ｜ ${fmt(balance)} 코인`, iconURL: avatar(guild, user.id) })]
      });
    }

    // ──────────────────────
    // 송금
    // ──────────────────────
    if (commandName === '송금') {
      const target = options.getUser('유저');
      const amount = toNum(options.getInteger('금액'));
      if (!target || amount <= 0 || user.id === target.id) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 송금 불가").setDescription("자기 자신에게는 송금할 수 없고 금액은 1 이상이어야 합니다.")] });
      }

      const senderRes = await db.query("SELECT balance FROM users WHERE id = $1", [user.id]);
      const senderRow = senderRes.rows[0];
      const senderBalance = senderRow ? toNum(senderRow.balance) : 0;

      if (!senderRow || senderBalance < amount) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 실패").setDescription("잔액 부족 또는 계정 없음")] });
      }

      const senderNick = guild?.members.cache.get(user.id)?.displayName || user.username;
      const targetNick = guild?.members.cache.get(target.id)?.displayName || target.username;

      await db.query("INSERT INTO users (id, balance, lastDaily) VALUES ($1, 0, '') ON CONFLICT (id) DO NOTHING", [target.id]);
      await db.query("UPDATE users SET balance = balance - $1 WHERE id = $2", [amount, user.id]);
      await db.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [amount, target.id]);

      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle("💌 송금 완료 💌")
          .setDescription(`**보낸 사람**\n${senderNick}\n\n**받는 사람**\n<@${target.id}>`)
          .setFooter({ text: `${targetNick} ｜ 💰 ${fmt(amount)} 코인`, iconURL: avatar(guild, target.id) })]
      });
    }

    // ──────────────────────
    // 동전던지기 (문자열 이어붙이기 방지)
// ──────────────────────
    if (commandName === '동전던지기') {
      const side = options.getString('선택');
      const betInput = options.getString('금액');

      const res = await db.query("SELECT balance FROM users WHERE id = $1", [user.id]);
      const row = res.rows[0];
      if (!row) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 실패").setDescription("계정이 없습니다. `/돈내놔`로 시작하세요!")] });

      const balance = toNum(row.balance);
      const bet = betInput === "올인" ? balance : toNum(parseInt(betInput, 10));

      if (!Number.isFinite(bet) || bet <= 0 || balance < bet) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 실패").setDescription("잔액 부족 혹은 금액 오류입니다.")] });
      }

      const coin = Math.random() < 0.5 ? '앞면' : '뒷면';
      const win = (coin === side);

      const newBalance = win ? (balance + bet) : (balance - bet);
      await db.query("UPDATE users SET balance = $1 WHERE id = $2", [newBalance, user.id]);

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(win ? COLOR_SUCCESS : COLOR_ERROR)
          .setTitle(win ? "🎉 승리 " : "❌ 패배 ")
          .setDescription(`${coin}!\n베팅: ${fmt(bet)} 코인`)
          .setFooter({ text: `${nick} ｜ ${fmt(newBalance)} 코인`, iconURL: avatar(guild, user.id) })]
      });
    }

    // ──────────────────────
    // 대박복권 (문자열 이어붙이기 방지)
// ──────────────────────
    if (commandName === '대박복권') {
      const betInput = options.getString('금액');
      const res = await db.query("SELECT balance FROM users WHERE id = $1", [user.id]);
      const row = res.rows[0];
      if (!row) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 실패").setDescription("계정이 없습니다. `/돈내놔`로 시작하세요!")] });

      const balance = toNum(row.balance);
      const bet = betInput === "올인" ? balance : toNum(parseInt(betInput, 10));

      if (!Number.isFinite(bet) || bet < 1000 || balance < bet) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 실패").setDescription("잔액 부족 또는 최소 베팅(1000) 이상이어야 합니다.")] });
      }

      const SYMBOLS = ["🥚", "🐣", "🐥", "🐔", "🍗", "💎"];
      const WEIGHTS = [42 , 27, 16, 10, 4.9, 0.1];
      const PAYOUTS = { "🐣": 2, "🐥": 3, "🐔": 5, "🍗": 10, "💎": 100 };

      const r = Math.random() * 100;
      let sum = 0, result = "🥚";
      for (let i = 0; i < SYMBOLS.length; i++) { sum += WEIGHTS[i]; if (r < sum) { result = SYMBOLS[i]; break; } }

      const multiplier = toNum(PAYOUTS[result] || 0);
      const payout = bet * multiplier;
      const delta = payout - bet; // 이익(손실)
      const newBal = balance + delta;

      await db.query("UPDATE users SET balance = $1 WHERE id = $2", [newBal, user.id]);

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(payout > 0 ? COLOR_SUCCESS : COLOR_ERROR)
          .setTitle(payout > 0 ? `🎉 당첨결과 ${result} ${multiplier}배` : `❌ 당첨결과 ${result} 꽝 `)
          .setDescription(payout > 0 ? `획득 +${fmt(delta)} 코인` : `손실 -${fmt(bet)} 코인`)
          .setFooter({ text: `${nick} ｜ ${fmt(newBal)} 코인`, iconURL: avatar(guild, user.id) })]
      });
    }

    // ──────────────────────
    // 야바위 (버튼 생성)
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

      const balance = toNum(row.balance);
      const bet = betInput === "올인" ? balance : toNum(parseInt(betInput, 10));
      if (!Number.isFinite(bet) || bet < 1000 || balance < bet) {
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
            .setCustomId(`yabawi_${i}_${cards.join(',')}_${bet}`)
            .setLabel(`카드 ${i + 1}`)
            .setStyle(ButtonStyle.Primary)
        )
      );

      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_INFO).setTitle("🎲 야바위 게임").setDescription("3장의 카드 중 하나를 선택하세요!")],
        components: [rowButtons]
      });
    }

// ──────────────────────
// 청소
// ──────────────────────
if (commandName === '청소') {
  const count = toNum(options.getInteger('개수'));
  const targetUser = options.getUser('유저');

  if (!guild) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 서버 전용").setDescription("DM에서는 사용할 수 없습니다.")]
    });
  }
  if (!Number.isFinite(count) || count < 1 || count > 100) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 개수 오류").setDescription("삭제 개수는 1~100 사이여야 합니다.")]
    });
  }

  const channel = interaction.channel;
  const messages = await channel.messages.fetch({ limit: 100 });

  const list = targetUser
    ? messages.filter(m => m.author.id === targetUser.id).first(count)
    : messages.first(count);

  if (!list || list.length === 0) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_INFO).setTitle("ℹ️ 삭제 없음").setDescription("삭제할 메시지가 없습니다.")]
    });
  }

  let deleted = 0;
  for (const m of list) {
    try { await m.delete(); deleted++; } catch {}
  }

  return interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR_SUCCESS)
      .setTitle("🧹 청소 완료")
      .setDescription(`${targetUser ? `<@${targetUser.id}>의 ` : ''}메시지 ${fmt(deleted)}개 삭제`)]
  });
}

// ──────────────────────
// 랭킹
// ──────────────────────
if (commandName === '랭킹') {
  const kind = options.getString('종류'); // 'server' | 'global'
  let rows = [];

  if (kind === 'global') {
    // 0원 제외
    const res = await db.query(
      "SELECT id, balance FROM users WHERE balance > 0 ORDER BY balance DESC LIMIT 10"
    );
    rows = res.rows;
  } else {
    if (!guild) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 서버 전용").setDescription("DM에서는 server 랭킹을 볼 수 없습니다.")]
      });
    }
    const memberIds = guild.members.cache.map(m => m.user.id);
    if (memberIds.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR_INFO).setTitle("ℹ️ 랭킹 없음").setDescription("표시할 멤버가 없습니다.")]
      });
    }
    // 0원 제외
    const res = await db.query(
      "SELECT id, balance FROM users WHERE id = ANY($1) AND balance > 0 ORDER BY balance DESC LIMIT 10",
      [memberIds]
    );
    rows = res.rows;
  }

  if (!rows || rows.length === 0) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR_INFO).setTitle("ℹ️ 랭킹 없음").setDescription("표시할 데이터가 없습니다.")]
    });
  }

  const lines = rows.map((r, i) => {
    const uname = client.users.cache.get(r.id)?.username || `User ${r.id}`;
    const name = guild ? (guild.members.cache.get(r.id)?.displayName || uname) : uname;
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    return `${medal} ${name} — ${fmt(toNum(r.balance))} 코인`;
  });

  return interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR_INFO)
      .setTitle(kind === 'global' ? "🌐 전체 코인 랭킹 TOP 10" : "🛡️ 서버 코인 랭킹 TOP 10")
      .setDescription(lines.join('\n'))]
  });
}

    // ──────────────────────
    // 버튼 처리 (야바위 선택) - 문자열 이어붙이기 방지
// ──────────────────────
if (interaction.isButton() && interaction.customId.startsWith('yabawi')) {
  // '_'로 split (customId: yabawi_{idx}_{cardsJoin}_{bet})
  const [_, index, cardString, betRaw] = interaction.customId.split('_');
  const chosen = Number.parseInt(index, 10);
  const wager = Number.parseInt(betRaw, 10);
  const cards = cardString.split(',');

  // 서버 닉네임 우선 표시명
  const g = interaction.guild;
  const member = g?.members?.cache?.get(interaction.user.id);
  const displayName = member?.displayName || interaction.user.username;

  const res = await db.query("SELECT balance FROM users WHERE id = $1", [interaction.user.id]);
  const row = res.rows[0];
  const balance = row ? toNum(row.balance) : 0;

  if (!row || balance < wager) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR_ERROR)
        .setTitle("❌ 오류")
        .setDescription("잔액이 부족하거나 계정이 없습니다.")],
      ephemeral: true
    });
  }

  const pickedCard = cards[chosen];
  const answerIndex = cards.indexOf("🎉");
  let newBal = balance;
  let embed;

  if (pickedCard === '🎉') {
    const payout = wager * 3;
    const delta = payout - wager; // +2배
    newBal = balance + delta;
    embed = new EmbedBuilder()
      .setColor(COLOR_SUCCESS)
      .setTitle("🎉 승리 ")
      .setDescription(`선택: 카드 ${chosen + 1} ${pickedCard}\n정답: 카드 ${answerIndex + 1}\n\n+${fmt(delta)} 코인`)
      .setFooter({ text: `${displayName} ｜ ${fmt(newBal)} 코인`, iconURL: avatar(g, interaction.user.id) });
  } else {
    newBal = balance - wager;
    embed = new EmbedBuilder()
      .setColor(COLOR_ERROR)
      .setTitle("❌ 패배 ")
      .setDescription(`선택: 카드 ${chosen + 1} ${pickedCard}\n정답: 카드 ${answerIndex + 1}\n\n-${fmt(wager)} 코인`)
      .setFooter({ text: `${displayName} ｜ ${fmt(newBal)} 코인`, iconURL: avatar(g, interaction.user.id) });
  }

  await db.query("UPDATE users SET balance = $1 WHERE id = $2", [newBal, interaction.user.id]);
  await interaction.update({ embeds: [embed], components: [] });
}

} catch (err) {
console.error("❌ interaction 처리 중 오류:", err);
}
});


// 마지막: 로그인
client.login(process.env.DISCORD_TOKEN);