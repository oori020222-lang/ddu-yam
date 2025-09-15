import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import sqlite3 from 'sqlite3';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const db = new sqlite3.Database('./database.db');
const fmt = (n) => Number(n).toLocaleString();

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT,
    guildId TEXT,
    balance INTEGER,
    lastDaily TEXT,
    PRIMARY KEY (id, guildId)
  )
`);

client.once('clientReady', () => {
  console.log(`🤖 ${client.user.tag}로 로그인함`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, user, guild } = interaction;

  // =======================
  // /돈내놔
  // =======================
  if (commandName === '돈내놔') {
    await interaction.deferReply();
    const today = new Date().toDateString();
    db.get("SELECT balance, lastDaily FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
      if (!row) {
        db.run("INSERT INTO users (id, guildId, balance, lastDaily) VALUES (?, ?, 20000, ?)", [user.id, guild.id, today]);
        return interaction.editReply(`💸 오늘 첫 돈! 20,000원을 지급했습니다!\n현재 잔액: ${fmt(20000)}`);
      }
      if (row.lastDaily === today) {
        return interaction.editReply("⏳ 오늘은 이미 돈을 받았습니다. 내일 다시 시도해주세요!");
      }
      const newBalance = row.balance + 20000;
      db.run("UPDATE users SET balance = ?, lastDaily = ? WHERE id = ? AND guildId = ?", [newBalance, today, user.id, guild.id]);
      interaction.editReply(`💸 20,000원을 받았습니다!\n현재 잔액: ${fmt(newBalance)}`);
    });
  }

  // =======================
  // /잔액
  // =======================
  else if (commandName === '잔액') {
    await interaction.deferReply();
    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
      if (!row) return interaction.editReply("❌ 아직 돈을 받은 적이 없습니다! `/돈내놔`로 시작하세요.");
      interaction.editReply(`💰 현재 잔액: ${fmt(row.balance)} 코인`);
    });
  }

  // =======================
  // /동전던지기
  // =======================
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

  // =======================
  // /대박복권 (34.9 / 30 / 20 / 10 / 5 / 0.1)
  // =======================
  else if (commandName === '대박복권') {
    await interaction.deferReply();
    const betInput = options.getString('금액');
    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
      if (!row) return interaction.editReply("❌ 먼저 `/돈내놔`로 계정을 생성하세요!");

      let bet = betInput === "올인" ? row.balance : parseInt(betInput);
      if (isNaN(bet) || bet < 1000) return interaction.editReply("❌ 최소 베팅액은 1,000입니다!");
      if (row.balance < bet) return interaction.editReply("❌ 코인이 부족합니다!");

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

      if (payout > 0) {
        interaction.editReply(`🎰 결과: ${result}\n🎉 당첨! 배당 x${SLOT_PAYOUTS[result]}\n획득: ${fmt(payout)} (순이익 +${fmt(delta)})\n현재 잔액: ${fmt(newBalance)}`);
      } else {
        interaction.editReply(`🎰 결과: ${result}\n❌ 꽝! -${fmt(bet)}\n현재 잔액: ${fmt(newBalance)}`);
      }
    });
  }

  // =======================
  // /야바위
  // =======================
  else if (commandName === '야바위') {
    await interaction.deferReply();
    const bet = options.getInteger('금액');
    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], async (err, row) => {
      if (!row) return interaction.editReply("❌ 먼저 `/돈내놔`로 계정을 생성하세요!");
      if (bet < 1000) return interaction.editReply("❌ 최소 베팅액은 1,000입니다!");
      if (row.balance < bet) return interaction.editReply("❌ 코인이 부족합니다!");

      const slots = ["❌ 꽝", "✨ 2배", "💎 3배"];
      const result = slots[Math.floor(Math.random() * slots.length)];
      let payout = result.includes("2배") ? bet * 2 : result.includes("3배") ? bet * 3 : 0;

      const delta = payout - bet;
      const newBalance = row.balance + delta;
      db.run("UPDATE users SET balance = ? WHERE id = ? AND guildId = ?", [newBalance, user.id, guild.id]);

      interaction.editReply(`🎲 야바위 결과: ${result}\n변동: ${delta >= 0 ? "+" : ""}${fmt(delta)}\n현재 잔액: ${fmt(newBalance)}`);
    });
  }

  // =======================
  // /송금
  // =======================
  else if (commandName === '송금') {
    await interaction.deferReply();
    const target = options.getUser('받는사람');
    const amount = options.getInteger('금액');
    if (user.id === target.id) return interaction.editReply("❌ 자기 자신에게는 송금할 수 없습니다!");
    if (amount <= 0) return interaction.editReply("❌ 송금 금액은 1 이상이어야 합니다!");

    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, senderRow) => {
      if (!senderRow || senderRow.balance < amount) return interaction.editReply("❌ 잔액이 부족합니다!");
      db.run("INSERT OR IGNORE INTO users (id, guildId, balance, lastDaily) VALUES (?, ?, 0, '')", [target.id, guild.id]);
      db.run("UPDATE users SET balance = balance - ? WHERE id = ? AND guildId = ?", [amount, user.id, guild.id]);
      db.run("UPDATE users SET balance = balance + ? WHERE id = ? AND guildId = ?", [amount, target.id, guild.id]);
      interaction.editReply(`💸 ${target.username} 님에게 ${fmt(amount)} 코인을 송금했습니다!`);
    });
  }

  // =======================
  // /랭킹 (서버/전체)
  // =======================
  else if (commandName === '랭킹') {
    await interaction.deferReply();
    const type = options.getString('종류');

    if (type === 'server') {
      db.all("SELECT id, balance FROM users WHERE guildId = ? AND balance > 0 ORDER BY balance DESC LIMIT 10", [guild.id], (err, rows) => {
        if (!rows || rows.length === 0) return interaction.editReply("📉 이 서버에 데이터가 없습니다!");

        let rankMsg = rows.map((row, i) => {
          const member = guild.members.cache.get(row.id);
          const name = member ? member.displayName : row.id;
          const trophy = i < 3 ? "🏆" : "";
          return `#${i+1} ${trophy} ${name} — ${fmt(row.balance)} 코인`;
        }).join("\n");

        interaction.editReply(`**⭐ ${guild.name} 서버 랭킹 TOP 10**\n${rankMsg}`);
      });
    } else if (type === 'global') {
      db.all("SELECT id, SUM(balance) as total FROM users GROUP BY id HAVING total > 0 ORDER BY total DESC LIMIT 10", (err, rows) => {
        if (!rows || rows.length === 0) return interaction.editReply("📉 아직 전체 데이터가 없습니다!");

        let rankMsg = rows.map((row, i) => {
          const userObj = client.users.cache.get(row.id);
          const name = userObj ? userObj.username : row.id;
          const trophy = i < 3 ? "🏆" : "";
          return `#${i+1} ${trophy} ${name} — ${fmt(row.total)} 코인`;
        }).join("\n");

        interaction.editReply(`**🏆 전체 서버 랭킹 TOP 10**\n${rankMsg}`);
      });
    }
  }

  // =======================
  // /청소
  // =======================
  else if (commandName === '청소') {
    const amount = options.getInteger('개수');
    const targetUser = options.getUser('유저');
    if (amount < 1 || amount > 100) return interaction.reply("❌ 1~100개까지만 삭제할 수 있습니다!");
    const channel = interaction.channel;

    if (targetUser) {
      const messages = await channel.messages.fetch({ limit: 100 });
      const userMessages = messages.filter(msg => msg.author.id === targetUser.id).first(amount);
      await channel.bulkDelete(userMessages, true);
      interaction.reply(`🧹 ${targetUser.username} 님의 메시지 ${userMessages.length}개를 삭제했습니다.`);
    } else {
      const messages = await channel.bulkDelete(amount, true);
      interaction.reply(`🧹 메시지 ${messages.size}개를 삭제했습니다.`);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
