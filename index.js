import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
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
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const db = new sqlite3.Database('./database.db');
const fmt = (n) => Number(n).toLocaleString();

const adminId = "627846998074327051"; // 제작자 Discord ID

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

// ✅ 최신 이벤트명
client.once('clientReady', () => {
  console.log(`🤖 ${client.user.tag}로 로그인함`);
});

// ======================
// Slash Command 처리
// ======================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, user, guild } = interaction;

  // /돈내놔 (빠른 응답 → reply)
  if (commandName === '돈내놔') {
    const today = new Date().toDateString();
    db.get("SELECT balance, lastDaily FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
      if (!row) {
        db.run("INSERT INTO users (id, guildId, balance, lastDaily) VALUES (?, ?, 20000, ?)", [user.id, guild.id, today]);
        return interaction.reply(`💸 오늘 첫 돈! 20,000원을 지급했습니다!\n현재 잔액: ${fmt(20000)}`);
      }
      if (row.lastDaily === today) {
        return interaction.reply("⏳ 오늘은 이미 돈을 받았습니다. 내일 다시 시도해주세요!");
      }
      const newBalance = row.balance + 20000;
      db.run("UPDATE users SET balance = ?, lastDaily = ? WHERE id = ? AND guildId = ?", [newBalance, today, user.id, guild.id]);
      interaction.reply(`💸 20,000원을 받았습니다!\n현재 잔액: ${fmt(newBalance)}`);
    });
  }

  // /잔액 (빠른 응답 → reply)
  else if (commandName === '잔액') {
    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
      if (!row) return interaction.reply("❌ 아직 돈을 받은 적이 없습니다! `/돈내놔`로 시작하세요.");
      interaction.reply(`💰 현재 잔액: ${fmt(row.balance)} 코인`);
    });
  }

  // /랭킹 (빠른 응답 → reply)
  else if (commandName === '랭킹') {
    const type = options.getString('종류');
    if (type === 'server') {
      db.all("SELECT id, balance FROM users WHERE guildId = ? AND balance > 0 ORDER BY balance DESC LIMIT 10", [guild.id], (err, rows) => {
        if (!rows || rows.length === 0) return interaction.reply("📉 이 서버에 데이터가 없습니다!");

        let rankMsg = rows.map((row, i) => {
          const member = guild.members.cache.get(row.id);
          const name = member ? member.displayName : row.id;
          const trophy = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
          return `${trophy} #${i + 1} ⭐ ${name} — ${fmt(row.balance)} 코인`;
        }).join("\n");

        interaction.reply(`**⭐ ${guild.name} 서버 랭킹 TOP 10**\n${rankMsg}`);
      });
    } else if (type === 'global') {
      db.all("SELECT id, SUM(balance) as total FROM users GROUP BY id HAVING total > 0 ORDER BY total DESC LIMIT 10", (err, rows) => {
        if (!rows || rows.length === 0) return interaction.reply("📉 아직 전체 데이터가 없습니다!");

        let rankMsg = rows.map((row, i) => {
          const member = client.users.cache.get(row.id);
          const name = member ? member.username : row.id;
          const trophy = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
          return `${trophy} #${i + 1} 🏆 ${name} — ${fmt(row.total)} 코인`;
        }).join("\n");

        interaction.reply(`**🏆 전체 서버 랭킹 TOP 10**\n${rankMsg}`);
      });
    }
  }

  // ======================
  // 오래 걸리는 명령어 (deferReply + editReply)
  // ======================

  // /동전던지기
  else if (commandName === '동전던지기') {
    await interaction.deferReply();
    const side = options.getString('선택');
    const bet = options.getInteger('금액');
    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
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
      db.run("UPDATE users SET balance = ? WHERE id = ? AND guildId = ?", [newBalance, user.id, guild.id]);
    });
  }

  // /대박복권
  else if (commandName === '대박복권') {
    await interaction.deferReply();
    let betInput = options.getString('금액');
    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
      if (!row) return interaction.editReply("❌ 먼저 `/돈내놔`로 계정을 생성하세요!");

      let bet = 0;
      if (betInput === "올인") {
        bet = row.balance;
        if (bet < 1000) return interaction.editReply("❌ 최소 올인 금액은 1,000 이상이어야 합니다!");
      } else {
        bet = parseInt(betInput);
        if (isNaN(bet) || bet < 1000) return interaction.editReply("❌ 최소 베팅액은 1,000입니다!");
      }

      if (row.balance < bet) return interaction.editReply("❌ 코인이 부족합니다!");

      // 확률표
      const SLOT_SYMBOLS = ["🥚", "🐣", "🐥", "🐔", "🍗", "💎"];
      const SLOT_WEIGHTS = [34.9, 30, 20, 10, 5, 0.1];  
      const SLOT_PAYOUTS = { 
        "🐣": 2, 
        "🐥": 3, 
        "🐔": 5, 
        "🍗": 10,
        "💎": 100
      };

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
      db.run("UPDATE users SET balance = ? WHERE id = ? AND guildId = ?", [newBalance, user.id, guild.id]);

      if (payout > 0) {
        if (result === "💎") {
          interaction.editReply(`💎 결과: ${result}\n🎉 초대박! 배당 x100\n획득: **${fmt(payout)}** (순이익 +${fmt(delta)})\n현재 잔액: ${fmt(newBalance)}`);
        } else {
          interaction.editReply(
            `🎰 결과: ${result}\n🎉 당첨! 배당 x${SLOT_PAYOUTS[result]}\n획득: **${fmt(payout)}** (순이익 +${fmt(delta)})\n현재 잔액: ${fmt(newBalance)}`
          );
        }
      } else {
        interaction.editReply(
          `🎰 결과: ${result}\n❌ 꽝! -${fmt(bet)}\n현재 잔액: ${fmt(newBalance)}`
        );
      }
    });
  }

  // /송금
  else if (commandName === '송금') {
    await interaction.deferReply();
    const target = options.getUser('받는사람');
    const amount = options.getInteger('금액');

    if (user.id === target.id) return interaction.editReply("❌ 자기 자신에게는 송금할 수 없습니다!");
    if (amount <= 0) return interaction.editReply("❌ 송금 금액은 1 이상이어야 합니다!");

    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, senderRow) => {
      if (!senderRow) return interaction.editReply("❌ 아직 돈을 받은 적이 없는 유저는 송금할 수 없습니다! `/돈내놔`로 시작하세요.");
      if (senderRow.balance < amount) return interaction.editReply("❌ 잔액이 부족합니다!");

      db.run("INSERT OR IGNORE INTO users (id, guildId, balance, lastDaily) VALUES (?, ?, 0, '')", [target.id, guild.id]);
      db.run("UPDATE users SET balance = balance - ? WHERE id = ? AND guildId = ?", [amount, user.id, guild.id]);
      db.run("UPDATE users SET balance = balance + ? WHERE id = ? AND guildId = ?", [amount, target.id, guild.id]);

      const member = guild.members.cache.get(target.id);
      const name = member ? member.displayName : target.username;

      interaction.editReply(`💸 ${name} 님에게 **${fmt(amount)}** 코인을 송금했습니다!`);
    });
  }

  // /관리자권한
  else if (commandName === '관리자권한') {
    const status = options.getString('상태');
    if (user.id !== adminId) {
      return interaction.reply("❌ 이 명령어는 관리자만 사용할 수 있습니다!");
    }
    setAdminMode(status === "on");
    interaction.reply(`✅ 관리자 모드가 **${status === "on" ? "켜짐" : "꺼짐"}** 상태로 변경되었습니다.`);
  }

  // /관리자지급
  else if (commandName === '관리자지급') {
    await interaction.deferReply();
    getAdminMode((isOn) => {
      if (!isOn) return interaction.editReply("❌ 관리자 모드가 꺼져 있습니다!");
      if (user.id !== adminId) return interaction.editReply("❌ 이 명령어는 관리자만 사용할 수 있습니다!");

      const target = options.getUser('대상');
      const amount = options.getInteger('금액');
      if (amount <= 0) return interaction.editReply("❌ 지급 금액은 1 이상이어야 합니다!");

      db.run("INSERT OR IGNORE INTO users (id, guildId, balance, lastDaily) VALUES (?, ?, 0, '')", [target.id, guild.id]);
      db.run("UPDATE users SET balance = balance + ? WHERE id = ? AND guildId = ?", [amount, target.id, guild.id]);

      const member = guild.members.cache.get(target.id);
      const name = member ? member.displayName : target.username;

      interaction.editReply(`✅ ${name} 님에게 **${fmt(amount)}** 코인을 지급했습니다!`);
    });
  }

  // /청소
  else if (commandName === '청소') {
    await interaction.deferReply();
    const amount = options.getInteger('개수');
    const targetUser = options.getUser('유저');

    if (amount < 1 || amount > 100) return interaction.editReply("❌ 1~100개까지만 삭제할 수 있습니다!");

    const channel = interaction.channel;

    let messages = await channel.messages.fetch({ limit: 100 });
    if (targetUser) {
      messages = messages.filter(msg => msg.author.id === targetUser.id).first(amount);
    } else {
      messages = messages.first(amount);
    }

    await channel.bulkDelete(messages, true);
    interaction.editReply(`🧹 ${messages.length}개의 메시지를 삭제했습니다.`);
  }
});

client.login(process.env.DISCORD_TOKEN);

