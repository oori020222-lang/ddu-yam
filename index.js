import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import sqlite3 from 'sqlite3';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const db = new sqlite3.Database('./database.db');

// 숫자 포맷
const fmt = (n) => Number(n).toLocaleString();

/* 📡 Slash 명령어 등록 */
const commands = [
  new SlashCommandBuilder().setName('돈내놔').setDescription('하루에 한 번 20,000원을 받습니다.'),
  new SlashCommandBuilder().setName('잔액').setDescription('내 잔액을 확인합니다.'),
  new SlashCommandBuilder()
    .setName('동전던지기')
    .setDescription('동전 앞/뒤 맞추기 (베팅 금액 또는 올인)')
    .addStringOption(o =>
      o.setName('선택')
        .setDescription('앞면/뒷면')
        .setRequired(true)
        .addChoices({ name: '앞면', value: '앞면' }, { name: '뒷면', value: '뒷면' }))
    .addStringOption(o =>
      o.setName('베팅')
        .setDescription('숫자 금액 또는 "올인"')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('10배복권')
    .setDescription('슬롯머신 (베팅 금액 또는 올인)')
    .addStringOption(o =>
      o.setName('베팅')
        .setDescription('숫자 금액 또는 "올인"')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('송금')
    .setDescription('다른 유저에게 송금')
    .addUserOption(o => o.setName('받는사람').setDescription('상대').setRequired(true))
    .addIntegerOption(o => o.setName('금액').setDescription('송금 금액').setRequired(true)),
  new SlashCommandBuilder()
    .setName('랭킹')
    .setDescription('전체 랭킹 확인'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('📡 명령어 등록 중...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ 명령어 등록 완료');
  } catch (e) {
    console.error(e);
  }
})();

/* DB 초기화 (공용 관리) */
db.run(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  balance INTEGER,
  lastDaily TEXT
)`);

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* 명령어 처리 */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, user } = interaction;

  // /돈내놔
  if (commandName === '돈내놔') {
    await interaction.deferReply();
    const today = new Date().toDateString();
    db.get("SELECT * FROM users WHERE id=?", [user.id], (err, row) => {
      if (!row) {
        db.run("INSERT INTO users VALUES(?,?,?)", [user.id, 20000, today]);
        return interaction.editReply(`💸 오늘 첫 돈! 20,000원을 지급했습니다!\n현재 잔액: ${fmt(20000)}`);
      }
      if (row.lastDaily === today) 
        return interaction.editReply("⏳ 오늘은 이미 돈을 받았습니다. 내일 다시 시도해주세요!");
      const newBal = row.balance + 20000;
      db.run("UPDATE users SET balance=?, lastDaily=? WHERE id=?", [newBal, today, user.id]);
      return interaction.editReply(`💸 20,000원을 받았습니다!\n현재 잔액: ${fmt(newBal)}`);
    });
  }

  // /잔액
  else if (commandName === '잔액') {
    await interaction.deferReply();
    db.get("SELECT balance FROM users WHERE id=?", [user.id], (err, row) => {
      if (!row) return interaction.editReply("❌ 아직 돈을 받은 적이 없습니다! `/돈내놔`로 시작하세요.");
      return interaction.editReply(`💰 현재 잔액: ${fmt(row.balance)} 코인`);
    });
  }

  // /동전던지기
  else if (commandName === '동전던지기') {
    await interaction.deferReply();
    const side = options.getString('선택');
    const betInput = options.getString('베팅');

    db.get("SELECT balance FROM users WHERE id=?", [user.id], (err, row) => {
      if (!row) return interaction.editReply("❌ 먼저 `/돈내놔`로 계정을 생성하세요!");

      let bet = 0;
      if (betInput === "올인") {
        bet = row.balance;
      } else {
        bet = parseInt(betInput, 10);
        if (isNaN(bet)) return interaction.editReply("❌ 금액은 숫자이거나 '올인'이어야 합니다!");
      }

      if (bet <= 0) return interaction.editReply("❌ 베팅 금액은 1 이상이어야 합니다!");
      if (row.balance < bet) return interaction.editReply("❌ 코인이 부족합니다!");

      const result = Math.random() < 0.5 ? '앞면' : '뒷면';
      const newBal = row.balance + (result === side ? bet : -bet);
      db.run("UPDATE users SET balance=? WHERE id=?", [newBal, user.id]);

      return interaction.editReply(`${result}! ${result === side ? '승리 🎉' : '패배 😢'}\n현재 잔액: ${fmt(newBal)}`);
    });
  }

  // /10배복권
  else if (commandName === '10배복권') {
    await interaction.deferReply();
    const betInput = options.getString('베팅');

    db.get("SELECT balance FROM users WHERE id=?", [user.id], (err, row) => {
      if (!row) return interaction.editReply("❌ 먼저 `/돈내놔`로 계정을 생성하세요!");

      let bet = 0;
      if (betInput === "올인") {
        bet = row.balance;
      } else {
        bet = parseInt(betInput, 10);
        if (isNaN(bet)) return interaction.editReply("❌ 금액은 숫자이거나 '올인'이어야 합니다!");
      }

      if (bet < 1000) return interaction.editReply("❌ 최소 베팅액은 1,000입니다!");
      if (row.balance < bet) return interaction.editReply("❌ 코인이 부족합니다!");

      const SYMBOLS = ["🥚","🐣","🐥","🐔","🍗"];
      const WEIGHTS = [30,30,20,15,5];
      const PAYOUTS = { "🐣":1, "🐥":2, "🐔":5, "🍗":10 };

      const r = Math.random()*100;
      let sum=0, result="🥚";
      for(let i=0;i<SYMBOLS.length;i++){ sum+=WEIGHTS[i]; if(r<sum){ result=SYMBOLS[i]; break; } }

      const payout = PAYOUTS[result] ? bet * PAYOUTS[result] : 0;
      const multiplier = PAYOUTS[result] ? PAYOUTS[result] : 0;
      const newBal = row.balance + (payout - bet);
      db.run("UPDATE users SET balance=? WHERE id=?", [newBal, user.id]);

      if (payout > 0) {
        return interaction.editReply(
          `🎰 결과: ${result}\n🎉 당첨! 배당 x${multiplier}\n획득: **${fmt(payout)}** (순이익 +${fmt(payout-bet)})\n현재 잔액: ${fmt(newBal)}`
        );
      } else {
        return interaction.editReply(
          `🎰 결과: ${result}\n❌ 꽝! -${fmt(bet)}\n현재 잔액: ${fmt(newBal)}`
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

    db.get("SELECT balance FROM users WHERE id=?", [user.id], (err, sender) => {
      if (!sender || sender.balance < amount) return interaction.editReply("❌ 잔액이 부족합니다!");
      db.run("INSERT OR IGNORE INTO users (id,balance,lastDaily) VALUES (?,?,?)", [target.id, 0, '']);
      db.run("UPDATE users SET balance=balance-? WHERE id=?", [amount, user.id]);
      db.run("UPDATE users SET balance=balance+? WHERE id=?", [amount, target.id]);
      return interaction.editReply(`💸 ${target.username} 님에게 **${fmt(amount)}** 코인을 송금했습니다!`);
    });
  }

  // /랭킹 (전체 공용)
  else if (commandName === '랭킹') {
    await interaction.deferReply();
    db.all("SELECT id, balance FROM users ORDER BY balance DESC LIMIT 10", (err, rows) => {
      if (!rows || rows.length === 0) return interaction.editReply("📉 아직 데이터가 없습니다!");
      let rankMsg = rows.map((row, i) => {
        const userTag = client.users.cache.get(row.id)?.username || row.id;
        return `#${i+1} 🏆 ${userTag} — ${fmt(row.balance)} 코인`;
      }).join("\n");
      return interaction.editReply(`**🌍 전체 랭킹 TOP 10**\n${rankMsg}`);
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
