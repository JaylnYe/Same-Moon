export type Place = {
  id: string;
  name: string;
  englishName: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  aliases: string;
};

export const CITIES: Place[] = [
  { id: "hangzhou", name: "杭州", englishName: "Hangzhou", country: "中国", latitude: 30.2741, longitude: 120.1551, timezone: "Asia/Shanghai", aliases: "hangzhou hz 杭州" },
  { id: "shanghai", name: "上海", englishName: "Shanghai", country: "中国", latitude: 31.2304, longitude: 121.4737, timezone: "Asia/Shanghai", aliases: "shanghai sh 上海" },
  { id: "beijing", name: "北京", englishName: "Beijing", country: "中国", latitude: 39.9042, longitude: 116.4074, timezone: "Asia/Shanghai", aliases: "beijing bj 北京" },
  { id: "guangzhou", name: "广州", englishName: "Guangzhou", country: "中国", latitude: 23.1291, longitude: 113.2644, timezone: "Asia/Shanghai", aliases: "guangzhou gz 广州" },
  { id: "shenzhen", name: "深圳", englishName: "Shenzhen", country: "中国", latitude: 22.5431, longitude: 114.0579, timezone: "Asia/Shanghai", aliases: "shenzhen sz 深圳" },
  { id: "chengdu", name: "成都", englishName: "Chengdu", country: "中国", latitude: 30.5728, longitude: 104.0668, timezone: "Asia/Shanghai", aliases: "chengdu cd 成都" },
  { id: "wuhan", name: "武汉", englishName: "Wuhan", country: "中国", latitude: 30.5928, longitude: 114.3055, timezone: "Asia/Shanghai", aliases: "wuhan wh 武汉" },
  { id: "xian", name: "西安", englishName: "Xi'an", country: "中国", latitude: 34.3416, longitude: 108.9398, timezone: "Asia/Shanghai", aliases: "xian xa 西安" },
  { id: "nanjing", name: "南京", englishName: "Nanjing", country: "中国", latitude: 32.0603, longitude: 118.7969, timezone: "Asia/Shanghai", aliases: "nanjing nj 南京" },
  { id: "xiamen", name: "厦门", englishName: "Xiamen", country: "中国", latitude: 24.4798, longitude: 118.0894, timezone: "Asia/Shanghai", aliases: "xiamen xm 厦门" },
  { id: "hongkong", name: "香港", englishName: "Hong Kong", country: "中国", latitude: 22.3193, longitude: 114.1694, timezone: "Asia/Hong_Kong", aliases: "hong kong hk 香港" },
  { id: "taipei", name: "台北", englishName: "Taipei", country: "中国", latitude: 25.033, longitude: 121.5654, timezone: "Asia/Taipei", aliases: "taipei 台北" },
  { id: "tokyo", name: "东京", englishName: "Tokyo", country: "日本", latitude: 35.6762, longitude: 139.6503, timezone: "Asia/Tokyo", aliases: "tokyo dongjing 东京" },
  { id: "osaka", name: "大阪", englishName: "Osaka", country: "日本", latitude: 34.6937, longitude: 135.5023, timezone: "Asia/Tokyo", aliases: "osaka daban 大阪" },
  { id: "seoul", name: "首尔", englishName: "Seoul", country: "韩国", latitude: 37.5665, longitude: 126.978, timezone: "Asia/Seoul", aliases: "seoul shouer 首尔" },
  { id: "singapore", name: "新加坡", englishName: "Singapore", country: "新加坡", latitude: 1.3521, longitude: 103.8198, timezone: "Asia/Singapore", aliases: "singapore 新加坡" },
  { id: "bangkok", name: "曼谷", englishName: "Bangkok", country: "泰国", latitude: 13.7563, longitude: 100.5018, timezone: "Asia/Bangkok", aliases: "bangkok mangu 曼谷" },
  { id: "london", name: "伦敦", englishName: "London", country: "英国", latitude: 51.5072, longitude: -0.1276, timezone: "Europe/London", aliases: "london lundun 伦敦" },
  { id: "paris", name: "巴黎", englishName: "Paris", country: "法国", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris", aliases: "paris bali 巴黎" },
  { id: "berlin", name: "柏林", englishName: "Berlin", country: "德国", latitude: 52.52, longitude: 13.405, timezone: "Europe/Berlin", aliases: "berlin bolin 柏林" },
  { id: "newyork", name: "纽约", englishName: "New York", country: "美国", latitude: 40.7128, longitude: -74.006, timezone: "America/New_York", aliases: "new york nyc niuyue 纽约" },
  { id: "losangeles", name: "洛杉矶", englishName: "Los Angeles", country: "美国", latitude: 34.0522, longitude: -118.2437, timezone: "America/Los_Angeles", aliases: "los angeles la luoshanji 洛杉矶" },
  { id: "vancouver", name: "温哥华", englishName: "Vancouver", country: "加拿大", latitude: 49.2827, longitude: -123.1207, timezone: "America/Vancouver", aliases: "vancouver wengehua 温哥华" },
  { id: "sydney", name: "悉尼", englishName: "Sydney", country: "澳大利亚", latitude: -33.8688, longitude: 151.2093, timezone: "Australia/Sydney", aliases: "sydney xini 悉尼" },
  { id: "melbourne", name: "墨尔本", englishName: "Melbourne", country: "澳大利亚", latitude: -37.8136, longitude: 144.9631, timezone: "Australia/Melbourne", aliases: "melbourne moerben 墨尔本" },
  { id: "auckland", name: "奥克兰", englishName: "Auckland", country: "新西兰", latitude: -36.8509, longitude: 174.7645, timezone: "Pacific/Auckland", aliases: "auckland aokelan 奥克兰" },
  { id: "dubai", name: "迪拜", englishName: "Dubai", country: "阿联酋", latitude: 25.2048, longitude: 55.2708, timezone: "Asia/Dubai", aliases: "dubai dibai 迪拜" },
];

export function findCity(id: string | null) {
  return CITIES.find((city) => city.id === id) ?? null;
}
