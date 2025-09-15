import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';

const commands = [
  // 돈내놔
  new SlashCommandBuilder()
    .setName('돈내놔')
    .setDescription('첫 돈 20,000원을 지급받습니다!'),

  // 잔액
  new SlashCommandBuilder()
    .setName('잔액')
    .setDescription('현재 잔액을 확인합니다.'),

  // 동전던지기
  new SlashCommandBuilder()
    .setName('동전던지기')
    .setDescription('동전 앞/뒤를 맞춰보세요!')
    .addStringOption(option =>
      option.setName('선택')
        .setDescription('앞면/뒷면 선택')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('금액')
        .setDescription('베팅 금액')
        .setRequired(true)),

  // 야바위
  new SlashCommandBuilder()
    .setName('야바위')
    .setDescription('3장의 카드 중 하나를 선택해보세요!')
    .addIntegerOption(option =>
      option.setName('금액')
        .setDescription('베팅 금액 (최소 1000)')
        .setRequired(true)),

  // 대박복권
  new SlashCommandBuilder()
    .setName('대박복권')
    .setDescription('치킨 복권! 최대 100배 보상!')
    .addIntegerOption(option =>
      option.setName('금액')
        .setDescription('베팅 금액 (최소 1000)')
        .setRequired(true)),

  // 송금
  new SlashCommandBuilder()
    .setName('송금')
    .setDescription('다른 유저에게 코인을 송금합니다.')
    .addUserOption(option =>
      option.setName('받는사람')
        .setDescription('송금 받을 유저')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('금액')
        .setDescription('송금할 금액')
        .setRequired(true)),

  // 랭킹
  new SlashCommandBuilder()
    .setName('랭킹')
    .setDescription('랭킹을 확인합니다.')
    .addStringOption(option =>
      option.setName('종류')
        .setDescription('서버 랭킹 또는 전체 랭킹')
        .setRequired(true)
        .addChoices(
          { name: '서버 랭킹', value: 'server' },
          { name: '전체 랭킹', value: 'global' }
        )),

  // 청소 (유저 선택 + 개수 지정)
  new SlashCommandBuilder()
    .setName('청소')
    .setDescription('채팅방 메시지를 삭제합니다 (1~100).')
    .addIntegerOption(option =>
      option.setName('개수')
        .setDescription('삭제할 메시지 수 (최대 100)')
        .setRequired(true))
    .addUserOption(option =>
      option.setName('유저')
        .setDescription('해당 유저의 메시지만 삭제 (선택사항)')
        .setRequired(false)),

  // 관리자권한
  new SlashCommandBuilder()
    .setName('관리자권한')
    .setDescription('관리자 모드를 ON/OFF 전환합니다.'),

  // 관리자지급
  new SlashCommandBuilder()
    .setName('관리자지급')
    .setDescription('관리자가 특정 유저에게 코인을 지급합니다.')
    .addUserOption(option =>
      option.setName('대상')
        .setDescription('코인을 줄 유저')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('금액')
        .setDescription('지급할 금액')
        .setRequired(true)),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('📡 명령어 등록 중...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ 명령어 등록 완료');
  } catch (err) {
    console.error(err);
  }
})();
