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

client.once('clientReady', () => {
  console.log(`🤖 ${client.user.tag}로 로그인함`);
});

// ======================
// Slash Command 처리
// ======================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, user, guild } = interaction;

  await interaction.deferReply();

  // /돈내놔
  if (commandName === '돈내놔') {
    const today = new Date().toDateString();
    db.get("SELECT balance, lastDaily FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
      const member = guild.members.cache.get(user.id);
      const displayName = member ? member.displayName : user.username;

      if (!row) {
        db.run("INSERT INTO users (id, guildId, balance, lastDaily) VALUES (?, ?, 20000, ?)", [user.id, guild.id, today]);

        const embed = new EmbedBuilder()
          .setTitle("🎉 첫 보상 지급 완료! 🎉")
          .setDescription(`${displayName} 님, 환영합니다!`)
          .addFields(
            { name: "지급된 코인", value: "💰 **20,000 코인**", inline: true },
            { name: "시작 안내", value: "✨ 오늘부터 코인 게임을 즐겨보세요!" }
          )
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setColor(0xFFD700);

        interaction.editReply({ embeds: [embed] });
        return;
      }

      if (row.lastDaily === today) {
        return interaction.editReply("⏳ 오늘은 이미 돈을 받았습니다. 내일 다시 시도해주세요!");
      }

      const newBalance = row.balance + 20000;
      db.run("UPDATE users SET balance = ?, lastDaily = ? WHERE id = ? AND guildId = ?", [newBalance, today, user.id, guild.id]);

      const embed = new EmbedBuilder()
        .setTitle("💸 오늘의 보상")
        .setDescription(`${displayName} 님에게 **20,000 코인** 지급 완료 ✅`)
        .addFields({ name: "현재 잔액", value: `${fmt(newBalance)} 코인`, inline: true })
        .setColor(0x00FF00);

      interaction.editReply({ embeds: [embed] });
    });
  }

  // /잔액
  else if (commandName === '잔액') {
    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
      const member = guild.members.cache.get(user.id);
      const displayName = member ? member.displayName : user.username;

      if (!row) return interaction.editReply("❌ 아직 돈을 받은 적이 없습니다! `/돈내놔`로 시작하세요.");

      const embed = new EmbedBuilder()
        .setTitle("💰 잔액 확인")
        .setDescription(`${displayName} 님의 현재 잔액`)
        .addFields({ name: "보유 코인", value: `${fmt(row.balance)} 코인`, inline: true })
        .setColor(0x1E90FF);

      interaction.editReply({ embeds: [embed] });
    });
  }

  // /동전던지기
  else if (commandName === '동전던지기') {
    const side = options.getString('선택');
    const bet = options.getInteger('금액');
    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
      if (!row) return interaction.editReply("❌ 먼저 `/돈내놔`로 계정을 생성하세요!");
      if (bet <= 0) return interaction.editReply("❌ 베팅 금액은 1 이상이어야 합니다!");
      if (row.balance < bet) return interaction.editReply("❌ 코인이 부족합니다!");

      const result = Math.random() < 0.5 ? '앞면' : '뒷면';
      let newBalance = row.balance;

      const member = guild.members.cache.get(user.id);
      const displayName = member ? member.displayName : user.username;

      if (result === side) {
        newBalance += bet;
        db.run("UPDATE users SET balance = ? WHERE id = ? AND guildId = ?", [newBalance, user.id, guild.id]);

        const embed = new EmbedBuilder()
          .setTitle("🎲 동전던지기 결과")
          .setDescription(`${displayName} 님의 선택: **${side}**\n나온 면: **${result}** ✅`)
          .addFields(
            { name: "승리 보상", value: `+${fmt(bet)} 코인`, inline: true },
            { name: "현재 잔액", value: `${fmt(newBalance)} 코인`, inline: true }
          )
          .setColor(0x00FF00)
          .setThumbnail(user.displayAvatarURL({ dynamic: true }));

        interaction.editReply({ embeds: [embed] });
      } else {
        newBalance -= bet;
        db.run("UPDATE users SET balance = ? WHERE id = ? AND guildId = ?", [newBalance, user.id, guild.id]);

        const embed = new EmbedBuilder()
          .setTitle("🎲 동전던지기 결과")
          .setDescription(`${displayName} 님의 선택: **${side}**\n나온 면: **${result}** ❌`)
          .addFields(
            { name: "손실", value: `-${fmt(bet)} 코인`, inline: true },
            { name: "현재 잔액", value: `${fmt(newBalance)} 코인`, inline: true }
          )
          .setColor(0xFF0000)
          .setThumbnail(user.displayAvatarURL({ dynamic: true }));

        interaction.editReply({ embeds: [embed] });
      }
    });
  }

  // /대박복권
  else if (commandName === '대박복권') {
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

      // 확률표 (34.9, 30, 20, 10, 5, 0.1)
      const SLOT_SYMBOLS = ["🥚", "🐣", "🐥", "🐔", "🍗", "💎"];
      const SLOT_WEIGHTS = [34.9, 30, 20, 10, 5, 0.1];
      const SLOT_PAYOUTS = { "🐣": 2, "🐥": 3, "🐔": 5, "🍗": 10, "💎": 100 };

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

      const member = guild.members.cache.get(user.id);
      const displayName = member ? member.displayName : user.username;

      if (payout > 0) {
        const embed = new EmbedBuilder()
          .setTitle(result === "💎" ? "💎 초대박 당첨! 💎" : "🎉 대박복권 결과")
          .setDescription(`${displayName} 님의 뽑기 결과는... **${result}**`)
          .addFields(
            { name: "배당", value: `x${SLOT_PAYOUTS[result]}`, inline: true },
            { name: "획득", value: `${fmt(payout)} 코인`, inline: true },
            { name: "현재 잔액", value: `${fmt(newBalance)} 코인`, inline: false }
          )
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setColor(result === "💎" ? 0xFFD700 : 0x00FF00);

        if (result === "💎") {
          embed.setFooter({ text: "🎆 축하합니다! 초대박 인생역전! 🎆" });
        }

        interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setTitle("😢 대박복권 결과")
          .setDescription(`${displayName} 님의 뽑기 결과는... **${result}**`)
          .addFields(
            { name: "손실", value: `-${fmt(bet)} 코인`, inline: true },
            { name: "현재 잔액", value: `${fmt(newBalance)} 코인`, inline: true }
          )
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .setColor(0xFF0000);

        interaction.editReply({ embeds: [embed] });
      }
    });
  }

  // /야바위
  else if (commandName === '야바위') {
    const bet = options.getInteger('금액');
    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], async (err, row) => {
      if (!row) return interaction.editReply("❌ 먼저 `/돈내놔`로 계정을 생성하세요!");
      if (bet < 1000) return interaction.editReply("❌ 최소 베팅액은 1,000입니다!");
      if (row.balance < bet) return interaction.editReply("❌ 코인이 부족합니다!");

      const member = guild.members.cache.get(user.id);
      const displayName = member ? member.displayName : user.username;

      const slots = ["❌ 꽝", "✨ 2배", "💎 3배"];
      const result = slots[Math.floor(Math.random() * slots.length)];

      let payout = 0;
      if (result.includes("2배")) payout = bet * 2;
      else if (result.includes("3배")) payout = bet * 3;

      const delta = payout - bet;
      const newBalance = row.balance + delta;
      db.run("UPDATE users SET balance = ? WHERE id = ? AND guildId = ?", [newBalance, user.id, guild.id]);

      const embed = new EmbedBuilder()
        .setTitle("🎲 야바위 결과")
        .setDescription(`${displayName} 님의 선택 결과는... **${result}**`)
        .addFields(
          { name: "베팅액", value: `${fmt(bet)} 코인`, inline: true },
          { name: "변동", value: delta >= 0 ? `+${fmt(delta)} 코인` : `${fmt(delta)} 코인`, inline: true },
          { name: "현재 잔액", value: `${fmt(newBalance)} 코인`, inline: false }
        )
        .setColor(payout > 0 ? 0x00FF00 : 0xFF0000)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }));

      interaction.editReply({ embeds: [embed] });
    });
  }

  // /송금
  else if (commandName === '송금') {
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

      const senderMember = guild.members.cache.get(user.id);
      const targetMember = guild.members.cache.get(target.id);
      const senderName = senderMember ? senderMember.displayName : user.username;
      const targetName = targetMember ? targetMember.displayName : target.username;

      const embed = new EmbedBuilder()
        .setTitle("💌 송금 완료")
        .setDescription(`${senderName} 님이 ${targetName} 님에게 코인을 보냈습니다!`)
        .addFields({ name: "송금액", value: `💰 ${fmt(amount)} 코인`, inline: true })
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setColor(0x00BFFF);

      interaction.editReply({ embeds: [embed] });
    });
  }

  // /랭킹
  else if (commandName === '랭킹') {
    const type = options.getString('종류');

    if (type === 'server') {
      db.all("SELECT id, balance FROM users WHERE guildId = ? AND balance > 0 ORDER BY balance DESC LIMIT 10", [guild.id], (err, rows) => {
        if (!rows || rows.length === 0) return interaction.editReply("📉 이 서버에 데이터가 없습니다!");

        let rankMsg = rows.map((row, i) => {
          const member = guild.members.cache.get(row.id);
          const displayName = member ? member.displayName : (client.users.cache.get(row.id)?.username || row.id);

          if (i === 0) return `#1 👑 ${displayName} — ${fmt(row.balance)} 코인`;
          if (i === 1) return `#2 🥈 ${displayName} — ${fmt(row.balance)} 코인`;
          if (i === 2) return `#3 🥉 ${displayName} — ${fmt(row.balance)} 코인`;
          return `#${i+1} ${displayName} — ${fmt(row.balance)} 코인`;
        }).join("\n");

        const embed = new EmbedBuilder()
          .setTitle(`⭐ ${guild.name} 서버 랭킹 TOP 10`)
          .setDescription(rankMsg)
          .setColor(0x1E90FF);

        interaction.editReply({ embeds: [embed] });
      });
    } else if (type === 'global') {
      db.all("SELECT id, SUM(balance) as total FROM users GROUP BY id HAVING total > 0 ORDER BY total DESC LIMIT 10", (err, rows) => {
        if (!rows || rows.length === 0) return interaction.editReply("📉 아직 전체 데이터가 없습니다!");

        let rankMsg = rows.map((row, i) => {
          const userObj = client.users.cache.get(row.id);
          const displayName = guild.members.cache.get(row.id)?.displayName || userObj?.username || row.id;

          if (i === 0) return `#1 👑 ${displayName} — ${fmt(row.total)} 코인`;
          if (i === 1) return `#2 🥈 ${displayName} — ${fmt(row.total)} 코인`;
          if (i === 2) return `#3 🥉 ${displayName} — ${fmt(row.total)} 코인`;
          return `#${i+1} ${displayName} — ${fmt(row.total)} 코인`;
        }).join("\n");

        const embed = new EmbedBuilder()
          .setTitle("🏆 전체 서버 랭킹 TOP 10")
          .setDescription(rankMsg)
          .setColor(0xFFD700);

        interaction.editReply({ embeds: [embed] });
      });
    }
  }

  // /청소
  else if (commandName === '청소') {
    const amount = options.getInteger('개수');
    const targetUser = options.getUser('유저');

    if (amount < 1 || amount > 100) {
      return interaction.editReply("❌ 1~100개까지만 삭제할 수 있습니다!");
    }

    const channel = interaction.channel;

    if (targetUser) {
      const messages = await channel.messages.fetch({ limit: 100 });
      const userMessages = messages.filter(msg => msg.author.id === targetUser.id).first(amount);

      await channel.bulkDelete(userMessages, true);

      const embed = new EmbedBuilder()
        .setTitle("🧹 청소 완료")
        .setDescription(`${targetUser.username} 님의 메시지 **${userMessages.length}개**를 삭제했습니다.`)
        .setColor(0x808080);

      interaction.editReply({ embeds: [embed] });
    } else {
      const messages = await channel.bulkDelete(amount, true);

      const embed = new EmbedBuilder()
        .setTitle("🧹 청소 완료")
        .setDescription(`메시지 **${messages.size}개**를 삭제했습니다.`)
        .setColor(0x808080);

      interaction.editReply({ embeds: [embed] });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

