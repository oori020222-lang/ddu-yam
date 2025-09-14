import { REST, Routes, SlashCommandBuilder } from 'discord.js';

// 등록할 명령어들
const commands = [
  // /돈내놔
  new SlashCommandBuilder()
    .setName('돈내놔')
    .setDescription('매일 20,000 코인을 받습니다.'),

  // /잔액
  new SlashCommandBuilder()
    .setName('잔액')
    .setDescription('현재 잔액을 확인합니다.'),

  // /동전던지기
  new SlashCommandBuilder()
    .setName('동전던지기')
    .setDescription('동전던지기 게임을 합니다.')
    .addStringOption(opt =>
      opt.setName('선택')
        .setDescription('앞면 또는 뒷면')
        .setRequired(true)
        .addChoices(
          { name: '앞면', value: '앞면' },
          { name: '뒷면', value: '뒷면' }
        )
    )
    .addIntegerOption(opt =>
      opt.setName('금액')
        .setDescription('베팅 금액')
        .setRequired(true)
    ),

  // /10배복권
  new SlashCommandBuilder()
    .setName('10배복권')
    .setDescription('복권에 도전! 최대 10배!')
    .addStringOption(opt =>
      opt.setName('베팅방식')
        .setDescription('베팅 방식을 선택')
        .setRequired(true)
        .addChoices(
          { name: '일반', value: 'normal' },
          { name: '올인', value: 'all' }
        )
    )
    .addIntegerOption(opt =>
      opt.setName('금액')
        .setDescription('베팅 금액 (올인 선택 시 무시됨)')
        .setRequired(false)
    ),

  // /송금
  new SlashCommandBuilder()
    .setName('송금')
    .setDescription('다른 유저에게 코인을 송금합니다.')
    .addUserOption(opt =>
      opt.setName('받는사람')
        .setDescription('코인을 받을 유저')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('금액')
        .setDescription('송금할 금액')
        .setRequired(true)
    ),

  // /랭킹
  new SlashCommandBuilder()
    .setName('랭킹')
    .setDescription('랭킹을 확인합니다.')
    .addStringOption(opt =>
      opt.setName('종류')
        .setDescription('랭킹 범위')
        .setRequired(true)
        .addChoices(
          { name: '서버 랭킹', value: 'server' },
          { name: '전체 랭킹', value: 'global' }
        )
    ),
].map(cmd => cmd.toJSON());

// REST 클라이언트 생성
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('📡 명령어 등록 중...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID), // 전역 등록
      { body: commands }
    );
    console.log('✅ 명령어 등록 완료');
  } catch (error) {
    console.error(error);
  }
})();