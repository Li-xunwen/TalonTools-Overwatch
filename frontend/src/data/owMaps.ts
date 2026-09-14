// 由 frontend/public/map 目录结构生成：文件夹名 = 地图类型，文件夹里的 svg = 类型图标，其余图片 = 地图
// 地图有增删或改名时，运行 npm run gen:maps 重新生成

export interface MapEntry {
  name: string
  image: string
}

export interface MapCategory {
  name: string
  icon: string
  maps: MapEntry[]
}

export const MAP_CATEGORIES: MapCategory[] = [
  {
    name: '攻击&护送',
    icon: '/map/攻击&护送/攻击&护送.svg',
    maps: [
      { name: '艾兴瓦尔德', image: '/map/攻击&护送/艾兴瓦尔德.webp' },
      { name: '暴雪世界', image: '/map/攻击&护送/暴雪世界.webp' },
      { name: '国王大道', image: '/map/攻击&护送/国王大道.webp' },
      { name: '好莱坞', image: '/map/攻击&护送/好莱坞.webp' },
      { name: '霓虹枢纽', image: '/map/攻击&护送/霓虹枢纽.webp' },
      { name: '努巴尼', image: '/map/攻击&护送/努巴尼.webp' },
      { name: '帕拉伊苏', image: '/map/攻击&护送/帕拉伊苏.webp' },
      { name: '中城', image: '/map/攻击&护送/中城.webp' },
    ]
  },
  {
    name: '护送机器人',
    icon: '/map/护送机器人/护送机器人.svg',
    maps: [
      { name: '埃斯佩兰萨', image: '/map/护送机器人/埃斯佩兰萨.webp' },
      { name: '斗兽场', image: '/map/护送机器人/斗兽场.webp' },
      { name: '鲁纳塞彼', image: '/map/护送机器人/鲁纳塞彼.webp' },
      { name: '新皇后街', image: '/map/护送机器人/新皇后街.webp' },
    ]
  },
  {
    name: '护送运载目标',
    icon: '/map/护送运载目标/护送运载目标.svg',
    maps: [
      { name: '66号公路', image: '/map/护送运载目标/66号公路.webp' },
      { name: '多拉多', image: '/map/护送运载目标/多拉多.webp' },
      { name: '哈瓦那', image: '/map/护送运载目标/哈瓦那.webp' },
      { name: '皇家赛道', image: '/map/护送运载目标/皇家赛道.webp' },
      { name: '监测站：直布罗陀', image: '/map/护送运载目标/监测站：直布罗陀.webp' },
      { name: '里阿尔托', image: '/map/护送运载目标/里阿尔托.webp' },
      { name: '香巴里寺院', image: '/map/护送运载目标/香巴里寺院.webp' },
      { name: '渣克镇', image: '/map/护送运载目标/渣克镇.webp' },
    ]
  },
  {
    name: '闪点',
    icon: '/map/闪点/闪点.svg',
    maps: [
      { name: '阿特利斯', image: '/map/闪点/阿特利斯.webp' },
      { name: '苏拉瓦萨', image: '/map/闪点/苏拉瓦萨.webp' },
      { name: '新渣客城', image: '/map/闪点/新渣客城.webp' },
    ]
  },
  {
    name: '占领目标点',
    icon: '/map/占领目标点/占领目标点.svg',
    maps: [
      { name: '釜山', image: '/map/占领目标点/釜山.webp' },
      { name: '漓江塔', image: '/map/占领目标点/漓江塔.webp' },
      { name: '绿洲城', image: '/map/占领目标点/绿洲城.webp' },
      { name: '南极半岛', image: '/map/占领目标点/南极半岛.webp' },
      { name: '尼泊尔', image: '/map/占领目标点/尼泊尔.webp' },
      { name: '萨摩亚', image: '/map/占领目标点/萨摩亚.webp' },
      { name: '伊里奥斯', image: '/map/占领目标点/伊里奥斯.webp' },
    ]
  },
]

// 全部地图名（投票 / 随机用）
export const ALL_MAP_NAMES: string[] = MAP_CATEGORIES.flatMap((category) => category.maps.map((map) => map.name))
