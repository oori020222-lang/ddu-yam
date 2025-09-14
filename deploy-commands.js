import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('돈내놔')
    .setDescription('매일 20,000 코인을 받습니다'),

  new SlashCommandBuilder()
    .setName('잔액')
    .setDescription('현재 잔액을 확인합니다'),

  new SlashCommandBuilder()
    .setName('동전던지기')
    .setDescription('앞면/뒷면에 베팅합니다')
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
    .setDescription('운을 시험하는 슬롯 머신')
    .addStringOption(option =>
      option.setName('베팅방식')
        .setDescription('"all" 입력 시 올인')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('금액')
        .setDescription('베팅 금액 (없으면 all과 함께 사용 가능)')
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
    .setDescription('잔액 랭킹을 확인합니다')
    .addStringOption(option =>
      option.setName('종류')
        .setDescription('서버 또는 전체')
        .setRequired(true)
        .addChoices(
          { name: '서버 랭킹', value: 'server' },
          { name: '전체 랭킹', value: 'global' }
        )),

  new SlashCommandBuilder()
    .setName('청소')
    .setDescription('채팅방 메시지를 삭제합니다 (관리자 전용)')
    .addIntegerOption(option =>
      option.setName('개수')
        .setDescription('삭제할 메시지 개수 (1~1000)')
        .setRequired(true)),
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

