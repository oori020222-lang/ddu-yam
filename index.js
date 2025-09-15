const { Client, GatewayIntentBits } = require('discord.js');
const sqlite3 = require('sqlite3');
const express = require('express');
require('dotenv').config();

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
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const db = new sqlite3.Database('./database.db');
const fmt = (n) => Number(n).toLocaleString();

const adminId = "627846998074327051"; // 제작자 ID

// DB 초기화 (guildId 제거, 전 서버 통합 잔액)
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    balance INTEGER,
    lastDaily TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS admin (
    id TEXT PRIMARY KEY,
    mode INTEGER
  )
`);

function getAdminMode(callback) {
  db.get("SELECT mode FROM admin WHERE id = ?", [adminId], (err, row) => {
    if (row) callback(row.mode === 1);
    else callback(false);
  });
}

function setAdminMode(state) {
  db.run("INSERT OR REPLACE INTO admin (id, mode) VALUES (?, ?)", [adminId, state ? 1 : 0]);
}

client.once('ready', () => {
  console.log(`🤖 ${client.user.tag}로 로그인함`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, user, guild } = interaction;

  await interaction.deferReply({ ephemeral: commandName.startsWith('관리자') });

  // /돈내놔
  if (commandName === '돈내놔') {
    const today = new Date().toDateString();
    db.get("SELECT balance, lastDaily FROM users WHERE id = ?", [user.id], (err, row) => {
      if (!row) {
        db.run("INSERT INTO users (id, balance, lastDaily) VALUES (?, 20000, ?)", [user.id, today]);
        return interaction.editReply(`💸 오늘 첫 돈! 20,000원을 지급했습니다!\n현재 잔액: ${fmt(20000)}`);
      }
      if (row.lastDaily === today) {
        return interaction.editReply("⏳ 오늘은 이미 돈을 받았습니다. 내일 다시 시도해주세요!");
      }
      const newBalance = row.balance + 20000;
      db.run("UPDATE users SET balance = ?, lastDaily = ? WHERE id = ?", [newBalance, today, user.id]);
      interaction.editReply(`💸 20,000원을 받았습니다!\n현재 잔액: ${fmt(newBalance)}`);
    });
  }

  // /잔액
  else if (commandName === '잔액') {
    db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, row) => {
      if (!row) return interaction.editReply("❌ 아직 돈을 받은 적이 없습니다! `/돈내놔`로 시작하세요.");
      interaction.editReply(`💰 현재 잔액: ${fmt(row.balance)} 코인`);
    });
  }

  // /동전던지기
  else if (commandName === '동전던지기') {
    const side = options.getString('선택');
    const bet = options.getInteger('금액');
    db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, row) => {
      if (!row) return interaction.editReply("❌ 먼저 `/돈내놔`로 계정을 생성하세요!");
      if (bet <= 0) return interaction.editReply("❌ 베팅 금액은 1 이상이어야 합니다!");
      if (row.balance < bet) return interaction.editReply("❌ 코인이 부족합니다!");

      const result = Math.random() < 0.5 ? '앞면' : '뒷면';
      let newBalance = row.balance;

      if (result === side) {
        newBalance += bet;
        interaction.editReply(`🎉 ${result}! 승리! +${fmt(bet)}\n현재 잔액: ${fmt(newBalance)}`);
      } else {
        newBalance -= bet;
        interaction.editReply(`😢 ${result}! 패배... -${fmt(bet)}\n현재 잔액: ${fmt(newBalance)}`);
      }
      db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user.id]);
    });
  }

  // /10배복권 (금액: 숫자 or "올인")
  else if (commandName === '10배복권') {
    let betInput = options.getString('금액');

    db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, row) => {
      if (!row) return interaction.editReply("❌ 먼저 `/돈내놔`로 계정을 생성하세요!");

      let bet;
      if (betInput === "올인") {
        bet = row.balance;
        if (bet < 1000) return interaction.editReply("❌ 최소 올인 금액은 1,000 이상이어야 합니다!");
      } else {
        bet = parseInt(betInput, 10);
        if (isNaN(bet) || bet < 1000) return interaction.editReply("❌ 최소 베팅액은 1,000입니다!");
        if (row.balance < bet) return interaction.editReply("❌ 코인이 부족합니다!");
      }

      const SLOT_SYMBOLS = ["🥚", "🐣", "🐥", "🐔", "🍗"];
      const SLOT_WEIGHTS = [35, 30, 20, 10, 5];
      const SLOT_PAYOUTS = { "🐣": 2, "🐥": 3, "🐔": 5, "🍗": 10 };

      const r = Math.random() * 100;
      let sum = 0, result = "🥚";
      for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
        sum += SLOT_WEIGHTS[i];
        if (r < sum) { result = SLOT_SYMBOLS[i]; break; }
      }

      let payout = 0;
      if (SLOT_PAYOUTS[result]) payout = bet * SLOT_PAYOUTS[result];

      const delta = payout - bet;
      const newBalance = row.balance + delta;
      db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user.id]);

      if (payout > 0) {
        interaction.editReply(
          `🎰 결과: ${result}\n🎉 당첨! 배당 x${SLOT_PAYOUTS[result]}\n획득: **${fmt(payout)}** (순이익 +${fmt(delta)})\n현재 잔액: ${fmt(newBalance)}`
        );
      } else {
        interaction.editReply(
          `🎰 결과: ${result}\n❌ 꽝! -${fmt(bet)}\n현재 잔액: ${fmt(newBalance)}`
        );
      }
    });
  }

  // /송금
  else if (commandName === '송금') {
    const target = options.getUser('받는사람');
    const amount = options.getInteger('금액');

    if (user.id === target.id) return interaction.editReply("❌ 자기 자신에게는 송금할 수 없습니다!");
    if (amount <= 0) return interaction.editReply("❌ 송금 금액은 1 이상이어야 합니다!");

    db.get("SELECT balance FROM users WHERE id = ?", [user.id], (err, senderRow) => {
      if (!senderRow) return interaction.editReply("❌ 아직 돈을 받은 적이 없는 유저는 송금할 수 없습니다! `/돈내놔`로 시작하세요.");
      if (senderRow.balance < amount) return interaction.editReply("❌ 잔액이 부족합니다!");

      db.run("INSERT OR IGNORE INTO users (id, balance, lastDaily) VALUES (?, 0, '')", [target.id]);
      db.run("UPDATE users SET balance = balance - ? WHERE id = ?", [amount, user.id]);
      db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, target.id]);

      interaction.editReply(`💸 ${target.username} 님에게 **${fmt(amount)}** 코인을 송금했습니다!`);
    });
  }

  // /랭킹 (이제 전 서버 통합만)
  else if (commandName === '랭킹') {
    db.all("SELECT id, balance FROM users ORDER BY balance DESC LIMIT 10", (err, rows) => {
      if (!rows || rows.length === 0) return interaction.editReply("📉 아직 데이터가 없습니다!");

      let rankMsg = rows.map((row, i) => {
        const userTag = client.users.cache.get(row.id)?.username || row.id;
        return `#${i+1} 🌍 ${userTag} — ${fmt(row.balance)} 코인`;
      }).join("\n");

      interaction.editReply(`**🌍 전체 랭킹 TOP 10**\n${rankMsg}`);
    });
  }

  // /관리자권한
  else if (commandName === '관리자권한') {
    if (user.id !== adminId) {
      return interaction.editReply({ content: "❌ 이 명령어는 제작자만 사용할 수 있습니다!", ephemeral: true });
    }

    const state = options.getString('상태');
    if (state === "on") {
      setAdminMode(true);
      return interaction.editReply({ content: "✅ 관리자 모드를 켰습니다.", ephemeral: true });
    } else if (state === "off") {
      setAdminMode(false);
      return interaction.editReply({ content: "❌ 관리자 모드를 껐습니다.", ephemeral: true });
    }
  }

  // /관리자지급
  else if (commandName === '관리자지급') {
    if (user.id !== adminId) {
      return interaction.editReply({ content: "❌ 이 명령어는 제작자만 사용할 수 있습니다!", ephemeral: true });
    }

    getAdminMode((isOn) => {
      if (!isOn) {
        return interaction.editReply({ content: "❌ 관리자 모드가 꺼져있습니다. `/관리자권한 on`으로 켜주세요.", ephemeral: true });
      }

      const target = options.getUser('대상');
      const amount = options.getInteger('금액');

      if (amount <= 0) return interaction.editReply({ content: "❌ 지급 금액은 1 이상이어야 합니다!", ephemeral: true });

      db.run("INSERT OR IGNORE INTO users (id, balance, lastDaily) VALUES (?, 0, '')", [target.id]);
      db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, target.id]);

      interaction.editReply({ content: `✅ ${target.username} 님에게 **${fmt(amount)}** 코인을 지급했습니다!`, ephemeral: true });
    });
  }

  // /청소
  else if (commandName === '청소') {
    const amount = options.getInteger('개수');
    const targetUser = options.getUser('유저');

    if (amount < 1 || amount > 100) {
      return interaction.editReply({ content: "❌ 1~100개까지만 삭제할 수 있습니다!", ephemeral: true });
    }

    const channel = interaction.channel;
    const messages = await channel.messages.fetch({ limit: amount });

    let deleted;
    if (targetUser) {
      const userMessages = messages.filter(m => m.author.id === targetUser.id);
      deleted = await channel.bulkDelete(userMessages, true);
      interaction.editReply({ content: `🧹 ${targetUser.username} 님의 메시지 ${deleted.size}개를 삭제했습니다.`, ephemeral: true });
    } else {
      deleted = await channel.bulkDelete(messages, true);
      interaction.editReply({ content: `🧹 최근 ${deleted.size}개의 메시지를 삭제했습니다.`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
