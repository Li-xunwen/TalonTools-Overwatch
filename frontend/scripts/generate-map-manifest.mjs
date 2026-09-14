// 生成地图清单：扫描 frontend/public/map 目录结构
//   - 文件夹名 = 地图类型名称
//   - 文件夹里的 svg（优先与文件夹同名，否则取第一个）= 类型图标
//   - 其余图片（webp / png / jpg / jpeg）= 地图
// 用法：npm run gen:maps
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
const mapRoot = path.join(projectRoot, 'public', 'map')
const outFile = path.join(projectRoot, 'src', 'data', 'owMaps.ts')

const IMAGE_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg'])

if (!fs.existsSync(mapRoot)) {
  console.error(`找不到地图目录：${mapRoot}`)
  process.exit(1)
}

const escape = (value) => String(value).replace(/'/g, "\\'")

const categories = fs
  .readdirSync(mapRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  .map((name) => {
    const dir = path.join(mapRoot, name)
    const files = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile())

    // 类型图标：优先 <文件夹名>.svg，否则取目录里第一个 svg
    const svgFiles = files.filter((entry) => path.extname(entry.name).toLowerCase() === '.svg')
    const iconFile =
      svgFiles.find((entry) => path.parse(entry.name).name === name) ?? svgFiles[0]

    const maps = files
      .filter((entry) => IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => ({ name: path.parse(entry.name).name, file: entry.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))

    return {
      name,
      icon: iconFile ? `/map/${name}/${iconFile.name}` : '',
      maps
    }
  })

const lines = [
  '// 由 frontend/public/map 目录结构生成：文件夹名 = 地图类型，文件夹里的 svg = 类型图标，其余图片 = 地图',
  '// 地图有增删或改名时，运行 npm run gen:maps 重新生成',
  '',
  'export interface MapEntry {',
  '  name: string',
  '  image: string',
  '}',
  '',
  'export interface MapCategory {',
  '  name: string',
  '  icon: string',
  '  maps: MapEntry[]',
  '}',
  '',
  'export const MAP_CATEGORIES: MapCategory[] = ['
]

for (const category of categories) {
  lines.push('  {')
  lines.push(`    name: '${escape(category.name)}',`)
  lines.push(`    icon: '${escape(category.icon)}',`)
  lines.push('    maps: [')
  for (const map of category.maps) {
    lines.push(`      { name: '${escape(map.name)}', image: '/map/${escape(category.name)}/${escape(map.file)}' },`)
  }
  lines.push('    ]')
  lines.push('  },')
}

lines.push(']')
lines.push('')
lines.push('// 全部地图名（投票 / 随机用）')
lines.push('export const ALL_MAP_NAMES: string[] = MAP_CATEGORIES.flatMap((category) => category.maps.map((map) => map.name))')
lines.push('')

fs.writeFileSync(outFile, lines.join('\n'), 'utf8')

const mapCount = categories.reduce((total, category) => total + category.maps.length, 0)
console.log(`已生成 ${path.relative(projectRoot, outFile)}：类型 ${categories.length} 个，地图 ${mapCount} 张`)
for (const category of categories) {
  console.log(`  ${category.name}：${category.maps.length} 张，图标 ${category.icon || '（无）'}`)
}
