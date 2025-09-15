import 'dotenv/config';
import { REST, Routes, ApplicationCommandOptionType } from 'discord.js';

const commands = [
  {
    name: '돈내놔',
    description: '하루에 한 번 20,000 코인을 지급받습니다.',
  },
  {
    name: '잔액',
    description: '현재 잔액을 확인합니다.',
  },
  {
    name: '송금',
    description: '다른 유저에게 코인을 송금합니다.',
    options: [
      {
        name: '유저',
        description: '송금할 대상',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: '금액',
        description: '송금할 금액',
        type: ApplicationCommandOptionType.Integer,
        required: true,
      },
    ],
  },
  {
    name: '관리자권한',
    description: '관리자 모드를 ON/OFF 전환합니다. (관리자만 사용 가능)',
  },
  {
    name: '관리자지급',
    description: '특정 유저에게 코인을 지급합니다. (관리자 모드 필요)',
    options: [
      {
        name: '유저',
        description: '코인을 지급할 유저',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: '금액',
        description: '지급할 금액',
        type: ApplicationCommandOptionType.Integer,
        required: true,
      },
    ],
  },
  {
    name: '동전던지기',
    description: '동전을 던져 앞/뒤 맞추기 게임!',
    options: [
      {
        name: '선택',
        description: '앞면 또는 뒷면',
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: '앞면', value: '앞면' },
          { name: '뒷면', value: '뒷면' },
        ],
      },
      {
        name: '금액',
        description: '베팅할 금액 (숫자 또는 "올인")',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: '대박복권',
    description: '100배까지 노려보는 복권 게임!',
    options: [
      {
        name: '금액',
        description: '베팅할 금액 (숫자 또는 "올인")',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: '야바위',
    description: '3장의 카드 중 당첨을 골라보세요!',
    options: [
      {
        name: '금액',
        description: '베팅할 금액 (숫자 또는 "올인")',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: '랭킹',
    description: '서버 또는 전체 랭킹을 확인합니다.',
    options: [
      {
        name: '종류',
        description: '랭킹 종류 선택',
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: '서버 랭킹', value: 'server' },
          { name: '전체 랭킹', value: 'global' },
        ],
      },
    ],
  },
  {
    name: '청소',
    description: '채팅 메시지를 삭제합니다. (관리자만 사용 권장)',
    options: [
      {
        name: '개수',
        description: '삭제할 메시지 수 (1~100)',
        type: ApplicationCommandOptionType.Integer,
        required: true,
      },
      {
        name: '유저',
        description: '특정 유저의 메시지만 삭제 (선택)',
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⏳ 명령어 등록 중...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });
    console.log('✅ 전역 명령어 등록 완료!');
  } catch (error) {
    console.error(error);
  }
})();

