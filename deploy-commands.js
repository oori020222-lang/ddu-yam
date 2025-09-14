import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';

const commands = [
  new SlashCommandBuilder()
    .setName('돈내놔')
    .setDescription('매일 20,000 코인을 받습니다!'),
  new SlashCommandBuilder()
    .setName('잔액')
    .setDescription('현재 잔액을 확인합니다.'),
  new SlashCommandBuilder()
    .setName('동전던지기')
    .setDescription('동전 앞/뒤를 맞춰보세요!')
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
    .setDescription('복권 뽑기 (최소 1000, "올인" 입력 시 전액 베팅)')
    .addStringOption(option =>
      option.setName('금액')
        .setDescription('베팅할 금액 또는 "올인"')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('송금')
    .setDescription('다른 유저에게 코인을 송금합니다.')
    .addUserOption(option =>
      option.setName('받는사람')
        .setDescription('송금할 대상')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('금액')
        .setDescription('송금 금액')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('랭킹')
    .setDescription('랭킹을 확인합니다.')
    .addStringOption(option =>
      option.setName('종류')
        .setDescription('서버 랭킹 또는 전체 랭킹')
        .setRequired(true)
        .addChoices(
          { name: '서버 랭킹', value: 'server' },
          { name: '전체 랭킹', value: 'global' },
        )),
].map(command => command.toJSON());

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
