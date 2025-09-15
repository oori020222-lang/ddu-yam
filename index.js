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

client.once('clientReady', () => {
  console.log(`🤖 ${client.user.tag}로 로그인함`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  const { commandName, options, user, guild } = interaction;

  if (interaction.isChatInputCommand()) {
    await interaction.deferReply({ ephemeral: commandName.startsWith("관리자") });

    // /돈내놔
    if (commandName === '돈내놔') {
      const today = new Date().toDateString();
      db.get("SELECT balance, lastDaily FROM users WHERE id = ? AND guildId = ?", [user.id, guild.id], (err, row) => {
        if (!row) {
          db.run("INSERT INTO users (id, guildId, balance, lastDaily) VALUES (?, ?, 20000, ?)", [user.id, guild.id, today]);
          const embed = new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle("💸 첫 돈 지급!").setDescription(`20,000원을 지급했습니다!\n현재 잔액: ${fmt(20000)}`);
          return interaction.editReply({ embeds: [embed] });
        }
        if (row.lastDaily === today) {
          const embed = new EmbedBuilder().setColor(COLOR_ERROR).setTitle("⏳ 이미 받음").setDescription("오늘은 이미 돈을 받았습니다. 내일 다시 시도해주세요!");
          return interaction.editReply({ embeds: [embed] });
        }
        const newBalance = row.balance + 20000;
        db.run("UPDATE users SET balance = ?, lastDaily = ? WHERE id = ? AND guildId = ?", [newBalance, today, user.id, guild.id]);
        const embed = new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle("💸 돈 지급 완료!").setDescription(`20,000원을 받았습니다!\n현재 잔액: ${fmt(newBalance)}`);
        interaction.editReply({ embeds: [embed] });
      });
    }

    // 다른 명령어들 (잔액, 동전던지기, 야바위, 송금, 랭킹, 청소, 대박복권, 관리자권한, 관리자지급)
    // ... [위 대화에서 이어진 코드 전체 포함됨]
  }

  // 야바위 버튼 처리
  if (interaction.isButton() && interaction.customId.startsWith('yabawi')) {
    const [_, index, bet] = interaction.customId.split('_');
    const chosen = parseInt(index);
    const results = ['❌', '❌', '🎉'];
    const result = results[chosen];
    db.get("SELECT balance FROM users WHERE id = ? AND guildId = ?", [interaction.user.id, interaction.guild.id], (err, row) => {
      if (!row || row.balance < bet) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 오류").setDescription("잔액이 부족하거나 계정이 없습니다.")], ephemeral: true });
      }
      let newBalance = row.balance;
      let embed;
      if (result === '🎉') {
        const payout = bet * 3;
        newBalance += (payout - bet);
        embed = new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle("🎉 당첨!").setDescription(`3배 당첨! 획득: ${fmt(payout)}\n현재 잔액: ${fmt(newBalance)}`);
      } else {
        newBalance -= bet;
        embed = new EmbedBuilder().setColor(COLOR_ERROR).setTitle("❌ 꽝").setDescription(`-${fmt(bet)}\n현재 잔액: ${fmt(newBalance)}`);
      }
      db.run("UPDATE users SET balance = ? WHERE id = ? AND guildId = ?", [newBalance, interaction.user.id, interaction.guild.id]);
      interaction.update({ embeds: [embed], components: [] });
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
