export function calculateShenSha(bazi: { yearGan: string, yearZhi: string, monthGan: string, monthZhi: string, dayGan: string, dayZhi: string, timeGan: string, timeZhi: string }) {
  const { yearGan, yearZhi, monthGan, monthZhi, dayGan, dayZhi, timeGan, timeZhi } = bazi;
  const pillars = [
    { name: '年柱', gan: yearGan, zhi: yearZhi },
    { name: '月柱', gan: monthGan, zhi: monthZhi },
    { name: '日柱', gan: dayGan, zhi: dayZhi },
    { name: '时柱', gan: timeGan, zhi: timeZhi }
  ];

  const shensha: Record<string, string[]> = {
    '年柱': [],
    '月柱': [],
    '日柱': [],
    '时柱': []
  };

  const addSha = (pillarName: string, sha: string) => {
    if (!shensha[pillarName].includes(sha)) {
      shensha[pillarName].push(sha);
    }
  };

  // 天乙贵人 (以日干或年干查)
  const tianYi: Record<string, string[]> = {
    '甲': ['丑', '未'], '戊': ['丑', '未'], '庚': ['丑', '未'],
    '乙': ['子', '申'], '己': ['子', '申'],
    '丙': ['亥', '酉'], '丁': ['亥', '酉'],
    '壬': ['卯', '巳'], '癸': ['卯', '巳'],
    '辛': ['寅', '午']
  };

  // 太极贵人 (以日干或年干查)
  const taiJi: Record<string, string[]> = {
    '甲': ['子', '午'], '乙': ['子', '午'],
    '丙': ['卯', '酉'], '丁': ['卯', '酉'],
    '戊': ['辰', '戌', '丑', '未'], '己': ['辰', '戌', '丑', '未'],
    '庚': ['寅', '亥'], '辛': ['寅', '亥'],
    '壬': ['巳', '申'], '癸': ['巳', '申']
  };

  // 文昌贵人 (以日干或年干查)
  const wenChang: Record<string, string> = {
    '甲': '巳', '乙': '午', '丙': '申', '丁': '酉', '戊': '申',
    '己': '酉', '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯'
  };

  // 福星贵人 (以日干或年干查)
  const fuXing: Record<string, string[]> = {
    '甲': ['寅', '子'], '乙': ['丑', '亥'], '丙': ['子', '戌'], '丁': ['亥', '酉'],
    '戊': ['申'], '己': ['未'], '庚': ['午'], '辛': ['巳'], '壬': ['辰'], '癸': ['卯']
  };

  // 禄神 (以日干查)
  const luShen: Record<string, string> = {
    '甲': '寅', '乙': '卯', '丙': '巳', '丁': '午', '戊': '巳',
    '己': '午', '庚': '申', '辛': '酉', '壬': '亥', '癸': '子'
  };

  // 羊刃 (以日干查)
  const yangRen: Record<string, string> = {
    '甲': '卯', '乙': '辰', '丙': '午', '丁': '未', '戊': '午',
    '己': '未', '庚': '酉', '辛': '戌', '壬': '子', '癸': '丑'
  };

  // 桃花 (以年支或日支查)
  const taoHua: Record<string, string> = {
    '申': '酉', '子': '酉', '辰': '酉',
    '寅': '卯', '午': '卯', '戌': '卯',
    '亥': '子', '卯': '子', '未': '子',
    '巳': '午', '酉': '午', '丑': '午'
  };

  // 驿马 (以年支或日支查)
  const yiMa: Record<string, string> = {
    '申': '寅', '子': '寅', '辰': '寅',
    '寅': '申', '午': '申', '戌': '申',
    '亥': '巳', '卯': '巳', '未': '巳',
    '巳': '亥', '酉': '亥', '丑': '亥'
  };

  // 华盖 (以年支或日支查)
  const huaGai: Record<string, string> = {
    '申': '辰', '子': '辰', '辰': '辰',
    '寅': '戌', '午': '戌', '戌': '戌',
    '亥': '未', '卯': '未', '未': '未',
    '巳': '丑', '酉': '丑', '丑': '丑'
  };

  // 将星 (以年支或日支查)
  const jiangXing: Record<string, string> = {
    '申': '子', '子': '子', '辰': '子',
    '寅': '午', '午': '午', '戌': '午',
    '亥': '卯', '卯': '卯', '未': '卯',
    '巳': '酉', '酉': '酉', '丑': '酉'
  };

  // 劫煞 (以年支或日支查)
  const jieSha: Record<string, string> = {
    '申': '巳', '子': '巳', '辰': '巳',
    '寅': '亥', '午': '亥', '戌': '亥',
    '亥': '申', '卯': '申', '未': '申',
    '巳': '寅', '酉': '寅', '丑': '寅'
  };

  // 亡神 (以年支或日支查)
  const wangShen: Record<string, string> = {
    '申': '亥', '子': '亥', '辰': '亥',
    '寅': '巳', '午': '巳', '戌': '巳',
    '亥': '寅', '卯': '寅', '未': '寅',
    '巳': '申', '酉': '申', '丑': '申'
  };

  // 灾煞 (以年支或日支查)
  const zaiSha: Record<string, string> = {
    '申': '午', '子': '午', '辰': '午',
    '寅': '子', '午': '子', '戌': '子',
    '亥': '酉', '卯': '酉', '未': '酉',
    '巳': '卯', '酉': '卯', '丑': '卯'
  };

  // 六厄 (以年支或日支查)
  const liuE: Record<string, string> = {
    '申': '卯', '子': '卯', '辰': '卯',
    '寅': '酉', '午': '酉', '戌': '酉',
    '亥': '午', '卯': '午', '未': '午',
    '巳': '子', '酉': '子', '丑': '子'
  };

  // 天德贵人 (以月支查)
  const tianDe: Record<string, string> = {
    '子': '巳', '丑': '庚', '寅': '丁', '卯': '申',
    '辰': '壬', '巳': '辛', '午': '亥', '未': '甲',
    '申': '癸', '酉': '寅', '戌': '丙', '亥': '乙'
  };

  // 月德贵人 (以月支查)
  const yueDe: Record<string, string> = {
    '寅': '丙', '午': '丙', '戌': '丙',
    '申': '壬', '子': '壬', '辰': '壬',
    '亥': '甲', '卯': '甲', '未': '甲',
    '巳': '庚', '酉': '庚', '丑': '庚'
  };

  // 天德合 (以月支查干)
  const tianDeHe: Record<string, string> = {
    '子': '申', '丑': '乙', '寅': '壬', '卯': '巳',
    '辰': '丁', '巳': '丙', '午': '寅', '未': '己',
    '申': '戊', '酉': '亥', '戌': '辛', '亥': '庚'
  };

  // 月德合 (以月支查干)
  const yueDeHe: Record<string, string> = {
    '寅': '辛', '午': '辛', '戌': '辛',
    '申': '丁', '子': '丁', '辰': '丁',
    '亥': '己', '卯': '己', '未': '己',
    '巳': '乙', '酉': '乙', '丑': '乙'
  };

  // 德秀贵人 (以月支查)
  const deXiu: Record<string, string[]> = {
    '寅': ['丙', '辛'], '午': ['丙', '辛'], '戌': ['丙', '辛'],
    '申': ['甲', '己'], '子': ['甲', '己'], '辰': ['甲', '己'],
    '亥': ['戊', '癸'], '卯': ['戊', '癸'], '未': ['戊', '癸'],
    '巳': ['乙', '庚'], '酉': ['乙', '庚'], '丑': ['乙', '庚']
  };

  // 红鸾 (以年支查)
  const hongLuan: Record<string, string> = {
    '子': '卯', '丑': '寅', '寅': '丑', '卯': '子',
    '辰': '亥', '巳': '戌', '午': '酉', '未': '申',
    '申': '未', '酉': '午', '戌': '巳', '亥': '辰'
  };

  // 天喜 (以年支查)
  const tianXi: Record<string, string> = {
    '子': '酉', '丑': '申', '寅': '未', '卯': '午',
    '辰': '巳', '巳': '辰', '午': '卯', '未': '寅',
    '申': '丑', '酉': '子', '戌': '亥', '亥': '戌'
  };

  // 孤辰 (以年支查)
  const guChen: Record<string, string> = {
    '亥': '寅', '子': '寅', '丑': '寅',
    '寅': '巳', '卯': '巳', '辰': '巳',
    '巳': '申', '午': '申', '未': '申',
    '申': '亥', '酉': '亥', '戌': '亥'
  };

  // 寡宿 (以年支查)
  const guaSu: Record<string, string> = {
    '亥': '戌', '子': '戌', '丑': '戌',
    '寅': '丑', '卯': '丑', '辰': '丑',
    '巳': '辰', '午': '辰', '未': '辰',
    '申': '未', '酉': '未', '戌': '未'
  };

  // 天医 (以月支查)
  const tianYiXing: Record<string, string> = {
    '寅': '丑', '卯': '寅', '辰': '卯', '巳': '辰',
    '午': '巳', '未': '午', '申': '未', '酉': '申',
    '戌': '酉', '亥': '戌', '子': '亥', '丑': '子'
  };

  pillars.forEach(pillar => {
    // 天乙贵人
    if (tianYi[dayGan]?.includes(pillar.zhi) || tianYi[yearGan]?.includes(pillar.zhi)) addSha(pillar.name, '天乙贵人');
    // 太极贵人
    if (taiJi[dayGan]?.includes(pillar.zhi) || taiJi[yearGan]?.includes(pillar.zhi)) addSha(pillar.name, '太极贵人');
    // 文昌贵人
    if (wenChang[dayGan] === pillar.zhi || wenChang[yearGan] === pillar.zhi) addSha(pillar.name, '文昌贵人');
    // 福星贵人
    if (fuXing[dayGan]?.includes(pillar.zhi) || fuXing[yearGan]?.includes(pillar.zhi)) addSha(pillar.name, '福星贵人');
    // 禄神
    if (luShen[dayGan] === pillar.zhi) addSha(pillar.name, '禄神');
    // 羊刃
    if (yangRen[dayGan] === pillar.zhi) addSha(pillar.name, '羊刃');
    
    // 桃花
    if (taoHua[yearZhi] === pillar.zhi || taoHua[dayZhi] === pillar.zhi) addSha(pillar.name, '桃花');
    // 驿马
    if (yiMa[yearZhi] === pillar.zhi || yiMa[dayZhi] === pillar.zhi) addSha(pillar.name, '驿马');
    // 华盖
    if (huaGai[yearZhi] === pillar.zhi || huaGai[dayZhi] === pillar.zhi) addSha(pillar.name, '华盖');
    // 将星
    if (jiangXing[yearZhi] === pillar.zhi || jiangXing[dayZhi] === pillar.zhi) addSha(pillar.name, '将星');
    // 劫煞
    if (jieSha[yearZhi] === pillar.zhi || jieSha[dayZhi] === pillar.zhi) addSha(pillar.name, '劫煞');
    // 亡神
    if (wangShen[yearZhi] === pillar.zhi || wangShen[dayZhi] === pillar.zhi) addSha(pillar.name, '亡神');
    // 灾煞
    if (zaiSha[yearZhi] === pillar.zhi || zaiSha[dayZhi] === pillar.zhi) addSha(pillar.name, '灾煞');
    // 六厄
    if (liuE[yearZhi] === pillar.zhi || liuE[dayZhi] === pillar.zhi) addSha(pillar.name, '六厄');

    // 天德贵人
    if (tianDe[monthZhi] === pillar.zhi || tianDe[monthZhi] === pillar.gan) addSha(pillar.name, '天德贵人');
    // 月德贵人
    if (yueDe[monthZhi] === pillar.gan) addSha(pillar.name, '月德贵人');
    // 天德合
    if (tianDeHe[monthZhi] === pillar.gan) addSha(pillar.name, '天德合');
    // 月德合
    if (yueDeHe[monthZhi] === pillar.gan) addSha(pillar.name, '月德合');
    // 德秀贵人
    if (deXiu[monthZhi]?.includes(pillar.gan)) addSha(pillar.name, '德秀贵人');
    // 天医
    if (tianYiXing[monthZhi] === pillar.zhi) addSha(pillar.name, '天医');

    // 红鸾
    if (hongLuan[yearZhi] === pillar.zhi) addSha(pillar.name, '红鸾');
    // 天喜
    if (tianXi[yearZhi] === pillar.zhi) addSha(pillar.name, '天喜');
    // 孤辰
    if (guChen[yearZhi] === pillar.zhi) addSha(pillar.name, '孤辰');
    // 寡宿
    if (guaSu[yearZhi] === pillar.zhi) addSha(pillar.name, '寡宿');
  });

  return shensha;
}

console.log(calculateShenSha({
  yearGan: '壬', yearZhi: '午',
  monthGan: '甲', monthZhi: '辰',
  dayGan: '丁', dayZhi: '卯',
  timeGan: '己', timeZhi: '酉'
}));
