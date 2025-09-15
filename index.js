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

// ──────────────────────
// Render keep-alive
// ──────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ──────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
const db = new sqlite3.Database('./database.db');
const fmt = (n) => Number(n).toLocaleString();

// DB (글로벌 잔액)
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    balance INTEGER,
    lastDaily TEXT
  )
`);

// 관리자
let adminMode = false;
const adminId = "627846998074327051";

// 색상
const COLOR_SUCCESS = 0x57f287;
const COLOR_ERROR   = 0xed4245;
const COLOR_INFO    = 0x3498db;
const COLOR_ADMIN   = 0xfee75c;

// 서버 프로필 아이콘 URL
const avatar = (guild, userId) => {
  const m = guild?.members?.cache?.get(userId);
  return m?.displayAvatarURL({ dynamic: true, size: 64 }) ||
         client.users.cache.get(userId)?.displayAvatarURL({ dynamic: true, size: 64 });
};

client.once('ready', () => {
  console.log(`🤖 ${client.user.tag} 로 로그인`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  const { commandName, options, user, guild } = interaction;
  const nick = guild?.members.cache.get(user.id)?.displayName || user.username;

  if (interaction.isChatInputCommand()) {
    await interaction.deferReply({ ephemeral: commandName.startsWith("관리자") });

    // ──────────────────────
    // /돈내놔
    // ──────────────────────
    if (commandName === '돈내놔') {
      const today = new Date().toDateString();
      db.get("SELECT balance, lastDaily FROM users WHERE id = ?", [user.id], (err, row) => {
        if (!row) {
          db.run("INSERT INTO users (id, balance, lastDaily) VALUES (?, 20000, ?)", [user.id, today]);
          const embed = new EmbedBuilder()
            .setColor(COLOR_ADMIN)
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
            .setDescription(`오늘은 이미 돈을 받았습니다. 내일 다시 시도해주세요!`);
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
    // /잔액
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
          .setTitle("💰 잔액 💰")
          .setDescription(`${fmt(row.balance)} 코인`);
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ──────────────────────
    // /동전던지기  (올인 지원)
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
            .setTitle(`🎉 ${result}! 승리`)
            .setDescription(
              `**획득 금액**\n+${fmt(bet)} 코인\n\n` +
              `**순이익**\n+${fmt(bet)} 코인\n\n` +
              `**현재 잔액**\n${fmt(newBalance)} 코인`
            );
        } else {
          newBalance -= bet;
          embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle(`😢 ${result}! 패배`)
            .setDescription(
              `**손실 금액**\n-${fmt(bet)} 코인\n\n` +
              `**순이익**\n-${fmt(bet)} 코인\n\n` +
              `**현재 잔액**\n${fmt(newBalance)} 코인`
            );
        }

        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user.id]);
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ──────────────────────
    // /송금
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
    // /관리자권한
    // ──────────────────────
    else if (commandName === '관리자권한') {
      if (user.id !== adminId) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
          .setTitle("❌ 권한 없음")
          .setDescription("이 명령어는 관리자만 사용할 수 있습니다!");
        return interaction.editReply({ embeds: [embed], ephemeral: true });
      }
      adminMode = !adminMode;
      const embed = new EmbedBuilder()
        .setColor(adminMode ? COLOR_SUCCESS : COLOR_ERROR)
        .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
        .setTitle("⚙️ 관리자 모드 전환")
        .setDescription(`관리자 모드가 ${adminMode ? '🟢 ON' : '🔴 OFF'} 상태가 되었습니다.`);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    // ──────────────────────
    // /관리자지급
    // ──────────────────────
    else if (commandName === '관리자지급') {
      if (user.id !== adminId || !adminMode) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setAuthor({ name: "보낸 사람: 관리자", iconURL: avatar(guild, user.id) })
          .setTitle("❌ 사용 불가")
          .setDescription("관리자 모드가 꺼져 있거나 권한이 없습니다.");
        return interaction.editReply({ embeds: [embed], ephemeral: true });
      }

      const target = options.getUser('유저');
      const amount = options.getInteger('금액');
      if (!target || amount <= 0) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setAuthor({ name: "보낸 사람: 관리자", iconURL: avatar(guild, user.id) })
          .setTitle("❌ 금액 오류")
          .setDescription("지급 금액은 1 이상이어야 합니다!");
        return interaction.editReply({ embeds: [embed], ephemeral: true });
      }

      db.run("INSERT OR IGNORE INTO users (id, balance, lastDaily) VALUES (?, 0, '')", [target.id]);
      db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, target.id]);

      const embed = new EmbedBuilder()
        .setColor(COLOR_ADMIN)
        .setAuthor({ name: "보낸 사람: 관리자", iconURL: avatar(guild, user.id) })
        .setTitle("💌 관리자 지급 완료 💌")
        .setDescription(
          `**받는 사람**\n<@${target.id}>\n\n` +
          `**지급 금액**\n💰 ${fmt(amount)} 코인`
        );
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    // ──────────────────────
    // /대박복권 (올인 지원 + 100배 강조)
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
        const delta  = payout - bet;
        const newBal = row.balance + delta;
        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBal, user.id]);

        let embed;
        if (result === "💎") {
          embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("✨ 초대박! 100배 당첨! ✨")
            .setDescription(
              `**결과**\n${result}\n\n` +
              `**획득 금액**\n${fmt(payout)} 코인\n\n` +
              `**순이익**\n+${fmt(delta)} 코인\n\n` +
              `**현재 잔액**\n${fmt(newBal)} 코인`
            );
        } else {
          embed = new EmbedBuilder()
            .setColor(payout > 0 ? COLOR_SUCCESS : COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle(payout > 0 ? `🎰 당첨! x${PAYOUTS[result]}` : "❌ 꽝")
            .setDescription(
              payout > 0
                ? `**결과**\n${result}\n\n**획득 금액**\n${fmt(payout)} 코인\n\n**순이익**\n+${fmt(delta)} 코인\n\n**현재 잔액**\n${fmt(newBal)} 코인`
                : `**결과**\n${result}\n\n**손실 금액**\n-${fmt(bet)} 코인\n\n**순이익**\n-${fmt(bet)} 코인\n\n**현재 잔액**\n${fmt(newBal)} 코인`
            );
        }
        interaction.editReply({ embeds: [embed] });
      });
    }

    // ──────────────────────
    // /서버랭킹 & /전체랭킹
    // ──────────────────────
    else if (commandName === '서버랭킹' || commandName === '전체랭킹') {
      const medal = (i) => (i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`);

      if (commandName === '서버랭킹') {
        db.all("SELECT id, balance FROM users WHERE balance > 0 ORDER BY balance DESC", (err, rows) => {
          const onlyServer = rows.filter(r => guild.members.cache.get(r.id)).slice(0, 10);
          if (!onlyServer.length) {
            const embed = new EmbedBuilder().setColor(COLOR_ERROR).setTitle("📉 데이터 없음");
            return interaction.editReply({ embeds: [embed] });
          }
          const desc = onlyServer.map((r,i)=>{
            const name = guild.members.cache.get(r.id)?.displayName || r.id;
            return `${medal(i)} ${name} — ${fmt(r.balance)} 코인 💰`;
          }).join("\n");

          const embed = new EmbedBuilder()
            .setColor(COLOR_INFO)
            .setTitle(`🏆 ${guild.name} 서버 랭킹`)
            .setDescription(desc);
          interaction.editReply({ embeds: [embed] });
        });
      } else {
        db.all("SELECT id, balance FROM users WHERE balance > 0 ORDER BY balance DESC LIMIT 10", (err, rows) => {
          if (!rows?.length) {
            const embed = new EmbedBuilder().setColor(COLOR_ERROR).setTitle("📉 데이터 없음");
            return interaction.editReply({ embeds: [embed] });
          }
          const desc = rows.map((r,i)=>{
            const name = client.users.cache.get(r.id)?.username || r.id;
            return `${medal(i)} ${name} — ${fmt(r.balance)} 코인 💰`;
          }).join("\n");

          const embed = new EmbedBuilder()
            .setColor(COLOR_INFO)
            .setTitle("🏆 전체 랭킹 TOP 10")
            .setDescription(desc);
          interaction.editReply({ embeds: [embed] });
        });
      }
    }

    // ──────────────────────
    // /청소
    // ──────────────────────
    else if (commandName === '청소') {
      const amount = options.getInteger('개수');
      const target = options.getUser('유저');

      if (amount < 1 || amount > 100) {
        const embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
          .setTitle("❌ 범위 오류")
          .setDescription("1~100개까지만 삭제할 수 있습니다!");
        return interaction.editReply({ embeds: [embed] });
      }

      const channel = interaction.channel;

      if (target) {
        const messages = await channel.messages.fetch({ limit: 100 });
        const toDelete = messages.filter(m => m.author.id === target.id).first(amount);
        for (const m of toDelete) await m.delete().catch(()=>{});
        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
          .setTitle("🧹 청소 완료!")
          .setDescription(`**대상 유저**\n${target.username}\n\n**삭제된 메시지 수**\n${toDelete.length} 개`);
        return interaction.editReply({ embeds: [embed] });
      } else {
        const deleted = await channel.bulkDelete(amount, true);
        const embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
          .setTitle("🧹 청소 완료!")
          .setDescription(`**삭제된 메시지 수**\n${deleted.size} 개`);
        return interaction.editReply({ embeds: [embed] });
      }
    }

    // ──────────────────────
    // /야바위 (올인 지원 + 랜덤 인코딩)
    // ──────────────────────
    else if (commandName === '야바위') {
      const betInput = options.getString('금액');
      db.get("SELECT balance FROM users WHERE id = ?", [user.id], async (err, row) => {
        if (!row) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 베팅 실패")
            .setDescription("계정이 없습니다. `/돈내놔`로 시작하세요!");
          return interaction.editReply({ embeds: [embed] });
        }

        let bet = (betInput === "올인") ? row.balance : parseInt(betInput, 10);
        if (!Number.isFinite(bet) || bet < 1000 || row.balance < bet) {
          const embed = new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
            .setTitle("❌ 베팅 실패")
            .setDescription("잔액이 부족하거나 최소 베팅(1000) 미만입니다.");
          return interaction.editReply({ embeds: [embed] });
        }

        const winIndex = Math.floor(Math.random() * 3);
        const rowButtons = new ActionRowBuilder().addComponents(
          [0,1,2].map((i) =>
            new ButtonBuilder()
              .setCustomId(`yabawi_${i}_${winIndex}_${bet}_${user.id}`)
              .setLabel(`카드 ${i + 1}`)
              .setStyle(ButtonStyle.Primary)
          )
        );

        const embed = new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setAuthor({ name: nick, iconURL: avatar(guild, user.id) })
          .setTitle("🎲 야바위 게임")
          .setDescription("3장의 카드 중 하나를 선택하세요!");
        interaction.editReply({ embeds: [embed], components: [rowButtons] });
      });
    }
  }

  // 버튼 처리 (야바위)
  if (interaction.isButton() && interaction.customId.startsWith("yabawi")) {
    const [_, idx, win, bet, uid] = interaction.customId.split("_");
    if (interaction.user.id !== uid) {
      return interaction.reply({ content: "❌ 본인만 선택 가능합니다.", ephemeral: true });
    }
    db.get("SELECT balance FROM users WHERE id = ?", [uid], (err, row) => {
      let newBal = row.balance;
      let embed;
      if (parseInt(idx) === parseInt(win)) {
        const payout = bet * 3;
        newBal += (payout - bet);
        embed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setAuthor({ name: interaction.user.username, iconURL: avatar(interaction.guild, uid) })
          .setTitle("🎉 당첨!")
          .setDescription(
            `3배 당첨!\n\n` +
            `**획득 금액**\n${fmt(payout)} 코인\n\n` +
            `**순이익**\n+${fmt(payout-bet)} 코인\n\n` +
            `**현재 잔액**\n${fmt(newBal)} 코인`
          );
      } else {
        newBal -= bet;
        embed = new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setAuthor({ name: interaction.user.username, iconURL: avatar(interaction.guild, uid) })
          .setTitle("❌ 꽝")
          .setDescription(
            `**손실 금액**\n-${fmt(bet)} 코인\n\n` +
            `**순이익**\n-${fmt(bet)} 코인\n\n` +
            `**현재 잔액**\n${fmt(newBal)} 코인`
          );
      }
      db.run("UPDATE users SET balance = ? WHERE id = ?", [newBal, uid]);
      interaction.update({ embeds: [embed], components: [] });
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
