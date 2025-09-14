import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('돈내놔')
    .setDescription('오늘의 첫 돈 20,000원을 지급받습니다'),

  new SlashCommandBuilder()
    .setName('잔액')
    .setDescription('현재 보유 코인을 확인합니다'),

  new SlashCommandBuilder()
    .setName('동전던지기')
    .setDescription('동전을 던져서 맞히면 배팅금을 얻습니다!')
    .addStringOption(option =>
      option.setName('선택')
        .setDescription('앞면 또는 뒷면')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('금액')
        .setDescription('베팅할 금액')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('10배복권')
    .setDescription('최대 10배 당첨이 가능한 복권!')
    .addStringOption(option =>
      option.setName('베팅방식')
        .setDescription('베팅 방식 선택 (all 입력 시 올인)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('금액')
        .setDescription('베팅 금액 (최소 1,000)')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('송금')
    .setDescription('다른 유저에게 코인을 송금합니다')
    .addUserOption(option =>
      option.setName('받는사람')
        .setDescription('송금할 유저')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('금액')
        .setDescription('송금할 금액')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('랭킹')
    .setDescription('서버별 또는 전체 랭킹을 확인합니다')
    .addStringOption(option =>
      option.setName('종류')
        .setDescription('server 또는 global')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('관리자권한')
    .setDescription('최고 관리자가 관리자 권한을 켜거나 끕니다')
    .addStringOption(option =>
      option.setName('모드')
        .setDescription('on 또는 off')
        .setRequired(true)),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('📡 명령어 등록 중...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('✅ 명령어 등록 완료');
  } catch (error) {
    console.error(error);
  }
})();

