export interface BaziProfileForm {
  name: string;
  gender: 'male' | 'female';
  birthDate: string;
  birthTime: string;
  birthLocation: string;
  currentLocation: string;
}

export type BaziProfileField = Exclude<keyof BaziProfileForm, 'gender'>;

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

export function validateBaziProfile(input: Partial<Record<keyof BaziProfileForm, unknown>>, today: string) {
  const value: BaziProfileForm = {
    name: text(input.name),
    gender: input.gender === 'female' ? 'female' : 'male',
    birthDate: text(input.birthDate),
    birthTime: text(input.birthTime),
    birthLocation: text(input.birthLocation),
    currentLocation: text(input.currentLocation),
  };
  const errors: Partial<Record<BaziProfileField, string>> = {};
  if (!value.name) errors.name = '请填写姓名或称呼，不能只输入空格。';
  if (!value.birthDate) errors.birthDate = '请填写公历出生日期。';
  else if (!isCalendarDate(value.birthDate)) errors.birthDate = '请输入真实的公历日期，格式为年-月-日。';
  else if (value.birthDate > today) errors.birthDate = '出生日期不能晚于今天。';
  if (!value.birthTime) errors.birthTime = '请填写出生时间。';
  else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.birthTime)) errors.birthTime = '请输入有效的出生时间，格式为小时:分钟。';
  if (!value.birthLocation) errors.birthLocation = '请填写出生地，不能只输入空格。';
  if (!value.currentLocation) errors.currentLocation = '请填写现居地，不能只输入空格。';
  return { value, errors, isValid: Object.keys(errors).length === 0, message: Object.values(errors)[0] || null };
}
