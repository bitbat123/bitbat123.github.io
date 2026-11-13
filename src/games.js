// 游戏清单：以后新增游戏只需在这里加一项即可
// href：游戏在域名下的路径
// multiplayer：是否包含联机模式（联机需要登录；游客只能玩单机）
export const GAMES = [
  {
    id: 'class-teacher',
    name: '班主任模拟器',
    icon: '🎓',
    tagline: '带一个班走完六年或七年，让学生从 F 一路升到 US。',
    tags: ['模拟经营', '随机事件'],
    href: '/class-sim/',
    multiplayer: false,
  },
];
