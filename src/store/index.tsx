import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  defaultMembership,
  normalizeMembership,
  type MembershipState,
} from '../lib/membership';
import {
  activateToday,
  defaultEngagement,
  normalizeEngagement,
  recordAppEvent,
  type AppEvent,
  type EngagementState,
} from '../lib/engagement';
import { saveAutoRecoveryPoint } from '../lib/appBackup';

// --- Constants & Data ---
export const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2500, 4000];
export const LEVEL_TITLES = ["萍水相逢", "星轨交汇", "灵魂共振", "命运羁绊", "星辰之主", "时空旅者", "造物之音", "永恒守护"];

export const FRAGMENTS_POOL = [
  { id: 'f1', name: '破碎的星光', rarity: 'N', icon: '✨', desc: '微弱的星光，似乎在诉说着什么。' },
  { id: 'f2', name: '占星者的草稿', rarity: 'N', icon: '📜', desc: '写满神秘符号的羊皮纸。' },
  { id: 'n3', name: '褪色的塔罗', rarity: 'N', icon: '🃏', desc: '边缘泛黄的普通纸牌，失去了魔力。' },
  { id: 'n4', name: '干枯的迷迭香', rarity: 'N', icon: '🌿', desc: '常用于占卜仪式的香草，已经失去了香气。' },
  { id: 'n5', name: '黯淡的水晶', rarity: 'N', icon: '💎', desc: '不再发光的廉价水晶碎块。' },
  { id: 'n6', name: '断裂的钟摆', rarity: 'N', icon: '🪀', desc: '曾经用来寻找失物的灵摆。' },
  { id: 'f3', name: '流泪的玫瑰', rarity: 'R', icon: '🌹', desc: '永不凋零，却永远在滴落露水。' },
  { id: 'f4', name: '破晓的提灯', rarity: 'R', icon: '🏮', desc: '能照亮迷途者前行的道路。' },
  { id: 'r3', name: '银月之镜', rarity: 'R', icon: '🪞', desc: '能在镜面中看到短暂的未来残影。' },
  { id: 'r4', name: '低语的海螺', rarity: 'R', icon: '🐚', desc: '贴在耳边能听到星海的潮汐声。' },
  { id: 'f5', name: '深渊的星屑', rarity: 'SR', icon: '🌌', desc: '来自宇宙深处的神秘物质。' },
  { id: 'f6', name: '逆流的沙漏', rarity: 'SR', icon: '⏳', desc: '据说能让时间短暂倒流。' },
  { id: 'sr3', name: '命运之轮的辐条', rarity: 'SR', icon: '🎡', desc: '命运之轮上脱落的碎片，蕴含改变运势的力量。' },
  { id: 'f7', name: '命运的纺锤', rarity: 'SSR', icon: '🧵', desc: '编织命运之线的神器。' },
  { id: 'f8', name: '愚者的王冠', rarity: 'SSR', icon: '👑', desc: '只有看破虚妄之人才能戴上。' },
];

export interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
  cardImage?: string;
  cardImages?: string[];
}

export interface UserProfile {
  id: string;
  name: string;
  gender: 'male' | 'female';
  birthDate: string;
  birthTime: string;
  birthLocation: string;
  currentLocation: string;
}

export interface SimulatorState {
  dilemma: string;
  choiceA: string;
  choiceB: string;
  result: any | null;
}

export interface TarotReading {
  id: string;
  date: string;
  question: string;
  cards: string;
  summary: string;
  cardImage?: string;
  cardImages?: string[];
}

export interface SimulationHistoryEntry {
  id: string;
  date: string;
  dilemma: string;
  choiceA: string;
  choiceB: string;
  advice: string;
  result: any;
}

export interface DiaryEntry {
  id: string;
  date: string;
  mood: 'great' | 'good' | 'neutral' | 'bad' | 'awful';
  content: string;
  tags: string[];
  aiReview?: string;
}

export interface ReviewEntry {
  id: string;
  date: string;
  content: string;
  rangeLabel?: string;
  startDate?: string;
  endDate?: string;
  entryCount?: number;
  entryIds?: string[];
}

export interface CompanionMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface AppSettings {
  hapticsEnabled: boolean;
  darkMode: boolean;
  bgmEnabled: boolean;
}

interface AppState {
  bondExp: number;
  setBondExp: React.Dispatch<React.SetStateAction<number>>;
  bondLevel: number;
  setBondLevel: React.Dispatch<React.SetStateAction<number>>;
  energy: number;
  setEnergy: React.Dispatch<React.SetStateAction<number>>;
  fragments: any[];
  setFragments: React.Dispatch<React.SetStateAction<any[]>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  cardImage: string;
  setCardImage: React.Dispatch<React.SetStateAction<string>>;
  communityPosts: any[];
  setCommunityPosts: React.Dispatch<React.SetStateAction<any[]>>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  userName: string;
  setUserName: React.Dispatch<React.SetStateAction<string>>;
  userAvatar: string | null;
  setUserAvatar: React.Dispatch<React.SetStateAction<string | null>>;
  companionOutfit: string;
  setCompanionOutfit: React.Dispatch<React.SetStateAction<string>>;
  theme: 'light' | 'dark';
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
  baziResult: any | null;
  setBaziResult: React.Dispatch<React.SetStateAction<any | null>>;
  baziFormData: any;
  setBaziFormData: React.Dispatch<React.SetStateAction<any>>;
  baziMessages: Message[];
  setBaziMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  profiles: UserProfile[];
  setProfiles: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  activeProfileId: string | null;
  setActiveProfileId: React.Dispatch<React.SetStateAction<string | null>>;
  simulatorState: SimulatorState;
  setSimulatorState: React.Dispatch<React.SetStateAction<SimulatorState>>;
  tarotReadings: TarotReading[];
  setTarotReadings: React.Dispatch<React.SetStateAction<TarotReading[]>>;
  simulationHistory: SimulationHistoryEntry[];
  setSimulationHistory: React.Dispatch<React.SetStateAction<SimulationHistoryEntry[]>>;
  diaryEntries: DiaryEntry[];
  setDiaryEntries: React.Dispatch<React.SetStateAction<DiaryEntry[]>>;
  reviewHistory: ReviewEntry[];
  setReviewHistory: React.Dispatch<React.SetStateAction<ReviewEntry[]>>;
  guardianMessages: CompanionMessage[];
  setGuardianMessages: React.Dispatch<React.SetStateAction<CompanionMessage[]>>;
  dailyLetter: string | null;
  setDailyLetter: React.Dispatch<React.SetStateAction<string | null>>;
  dailyLetterDate: string | null;
  setDailyLetterDate: React.Dispatch<React.SetStateAction<string | null>>;
  dailyRewardDate: string | null;
  setDailyRewardDate: React.Dispatch<React.SetStateAction<string | null>>;
  checkInStreak: number;
  setCheckInStreak: React.Dispatch<React.SetStateAction<number>>;
  lastCheckInDate: string | null;
  setLastCheckInDate: React.Dispatch<React.SetStateAction<string | null>>;
  membership: MembershipState;
  setMembership: React.Dispatch<React.SetStateAction<MembershipState>>;
  engagement: EngagementState;
  setEngagement: React.Dispatch<React.SetStateAction<EngagementState>>;
  appEvents: AppEvent[];
  setAppEvents: React.Dispatch<React.SetStateAction<AppEvent[]>>;
}

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [bondExp, setBondExp] = useState(() => {
    const saved = localStorage.getItem('bondExp');
    return saved ? JSON.parse(saved) : 0;
  });
  const [bondLevel, setBondLevel] = useState(() => {
    const saved = localStorage.getItem('bondLevel');
    return saved ? JSON.parse(saved) : 1;
  });
  const [energy, setEnergy] = useState(() => {
    const saved = localStorage.getItem('energy');
    return saved ? JSON.parse(saved) : 5;
  });
  const [fragments, setFragments] = useState<any[]>(() => {
    const saved = localStorage.getItem('fragments');
    return saved ? JSON.parse(saved) : [];
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('messages');
    return saved ? JSON.parse(saved) : [
      { 
        id: 'init', 
        role: 'ai', 
        text: '你好呀，我是星轨的引路人。初次见面，让我为你指引前方的道路吧。✨\n\n在这里，你可以向我倾诉任何烦恼，我会为你抽取塔罗牌进行占卜。目前我掌握了以下几种占卜模式：\n1. **单张指引**：快速解答你当下的疑惑或提供今日运势。\n2. **圣三角**：通过三张牌分别解读你的过去、现在和未来。\n3. **爱情十字**：专门为你解析感情状况与发展趋势。\n4. **事业岔路**：当你面临选择时，帮你分析不同选择的走向。\n\n你可以直接点击下方的快捷按钮，或者在输入框告诉我你想占卜什么内容哦~', 
        timestamp: Date.now() 
      }
    ];
  });
  const [cardImage, setCardImage] = useState(() => {
    const saved = localStorage.getItem('cardImage');
    return saved ? JSON.parse(saved) : '/default-card.png';
  });
  const [communityPosts, setCommunityPosts] = useState<any[]>(() => {
    const saved = localStorage.getItem('communityPosts');
    return saved ? JSON.parse(saved) : [];
  });
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('settings');
    return saved ? JSON.parse(saved) : {
      hapticsEnabled: true,
      darkMode: false,
      bgmEnabled: false
    };
  });
  const [userName, setUserName] = useState(() => {
    const saved = localStorage.getItem('userName');
    return saved ? JSON.parse(saved) : '星轨旅人';
  });
  const [userAvatar, setUserAvatar] = useState<string | null>(() => {
    const saved = localStorage.getItem('userAvatar');
    return saved ? JSON.parse(saved) : null;
  });
  const [companionOutfit, setCompanionOutfit] = useState<string>(() => {
    const saved = localStorage.getItem('companionOutfit');
    if (!saved) return 'auto';
    try {
      return JSON.parse(saved);
    } catch {
      return saved;
    }
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved as 'light' | 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [baziResult, setBaziResult] = useState<any | null>(() => {
    const saved = localStorage.getItem('baziResult');
    return saved ? JSON.parse(saved) : null;
  });
  const [baziFormData, setBaziFormData] = useState<any>(() => {
    const saved = localStorage.getItem('baziFormData');
    const parsed = saved ? JSON.parse(saved) : null;
    return {
      name: parsed?.name || '',
      gender: parsed?.gender || 'male',
      birthDate: parsed?.birthDate || '',
      birthTime: parsed?.birthTime || '',
      birthLocation: parsed?.birthLocation || parsed?.location || '',
      currentLocation: parsed?.currentLocation || ''
    };
  });
  const [baziMessages, setBaziMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('baziMessages');
    return saved ? JSON.parse(saved) : [];
  });
  const [profiles, setProfiles] = useState<UserProfile[]>(() => {
    const saved = localStorage.getItem('profiles');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    const saved = localStorage.getItem('activeProfileId');
    return saved ? JSON.parse(saved) : null;
  });
  const [simulatorState, setSimulatorState] = useState<SimulatorState>(() => {
    const saved = localStorage.getItem('simulatorState');
    return saved ? JSON.parse(saved) : { dilemma: '', choiceA: '', choiceB: '', result: null };
  });
  const [tarotReadings, setTarotReadings] = useState<TarotReading[]>(() => {
    const saved = localStorage.getItem('tarotReadings');
    return saved ? JSON.parse(saved) : [];
  });
  const [simulationHistory, setSimulationHistory] = useState<SimulationHistoryEntry[]>(() => {
    const saved = localStorage.getItem('simulationHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>(() => {
    const saved = localStorage.getItem('diaryEntries');
    return saved ? JSON.parse(saved) : [];
  });
  const [reviewHistory, setReviewHistory] = useState<ReviewEntry[]>(() => {
    const saved = localStorage.getItem('reviewHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const [guardianMessages, setGuardianMessages] = useState<CompanionMessage[]>(() => {
    const saved = localStorage.getItem('guardianMessages');
    return saved ? JSON.parse(saved) : [];
  });
  const [dailyLetter, setDailyLetter] = useState<string | null>(() => {
    const saved = localStorage.getItem('dailyLetter');
    return saved ? JSON.parse(saved) : null;
  });
  const [dailyLetterDate, setDailyLetterDate] = useState<string | null>(() => {
    const saved = localStorage.getItem('dailyLetterDate');
    return saved ? JSON.parse(saved) : null;
  });
  const [dailyRewardDate, setDailyRewardDate] = useState<string | null>(() => {
    const saved = localStorage.getItem('dailyRewardDate');
    return saved ? JSON.parse(saved) : null;
  });
  const [checkInStreak, setCheckInStreak] = useState<number>(() => {
    const saved = localStorage.getItem('checkInStreak');
    return saved ? JSON.parse(saved) : 0;
  });
  const [lastCheckInDate, setLastCheckInDate] = useState<string | null>(() => {
    const saved = localStorage.getItem('lastCheckInDate');
    return saved ? JSON.parse(saved) : null;
  });
  const [membership, setMembership] = useState<MembershipState>(() => {
    const saved = localStorage.getItem('membership');
    if (!saved) return defaultMembership;
    try {
      return normalizeMembership(JSON.parse(saved));
    } catch {
      return defaultMembership;
    }
  });
  const [engagement, setEngagement] = useState<EngagementState>(() => {
    const saved = localStorage.getItem('engagement');
    if (!saved) return defaultEngagement;
    try {
      return activateToday(normalizeEngagement(JSON.parse(saved)));
    } catch {
      return defaultEngagement;
    }
  });
  const [appEvents, setAppEvents] = useState<AppEvent[]>(() => {
    const saved = localStorage.getItem('appEvents');
    return saved ? JSON.parse(saved) : [];
  });

  React.useEffect(() => {
    setAppEvents((events) => recordAppEvent(events, 'session_start', { activeDays: engagement.activeDays }));
  }, []);

  React.useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  React.useEffect(() => {
    localStorage.setItem('bondExp', JSON.stringify(bondExp));
  }, [bondExp]);

  React.useEffect(() => {
    localStorage.setItem('bondLevel', JSON.stringify(bondLevel));
  }, [bondLevel]);

  React.useEffect(() => {
    localStorage.setItem('energy', JSON.stringify(energy));
  }, [energy]);

  React.useEffect(() => {
    localStorage.setItem('fragments', JSON.stringify(fragments));
  }, [fragments]);

  React.useEffect(() => {
    localStorage.setItem('messages', JSON.stringify(messages));
  }, [messages]);

  React.useEffect(() => {
    localStorage.setItem('cardImage', JSON.stringify(cardImage));
  }, [cardImage]);

  React.useEffect(() => {
    localStorage.setItem('communityPosts', JSON.stringify(communityPosts));
  }, [communityPosts]);

  React.useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

  React.useEffect(() => {
    localStorage.setItem('userName', JSON.stringify(userName));
  }, [userName]);

  React.useEffect(() => {
    localStorage.setItem('userAvatar', JSON.stringify(userAvatar));
  }, [userAvatar]);

  React.useEffect(() => {
    localStorage.setItem('companionOutfit', JSON.stringify(companionOutfit));
  }, [companionOutfit]);

  React.useEffect(() => {
    localStorage.setItem('baziResult', JSON.stringify(baziResult));
  }, [baziResult]);

  React.useEffect(() => {
    localStorage.setItem('baziFormData', JSON.stringify(baziFormData));
  }, [baziFormData]);

  React.useEffect(() => {
    localStorage.setItem('baziMessages', JSON.stringify(baziMessages));
  }, [baziMessages]);

  React.useEffect(() => {
    localStorage.setItem('profiles', JSON.stringify(profiles));
  }, [profiles]);

  React.useEffect(() => {
    localStorage.setItem('activeProfileId', JSON.stringify(activeProfileId));
  }, [activeProfileId]);

  React.useEffect(() => {
    localStorage.setItem('simulatorState', JSON.stringify(simulatorState));
  }, [simulatorState]);

  React.useEffect(() => {
    localStorage.setItem('tarotReadings', JSON.stringify(tarotReadings));
  }, [tarotReadings]);

  React.useEffect(() => {
    localStorage.setItem('simulationHistory', JSON.stringify(simulationHistory));
  }, [simulationHistory]);

  React.useEffect(() => {
    localStorage.setItem('diaryEntries', JSON.stringify(diaryEntries));
  }, [diaryEntries]);

  React.useEffect(() => {
    localStorage.setItem('reviewHistory', JSON.stringify(reviewHistory));
  }, [reviewHistory]);

  React.useEffect(() => {
    localStorage.setItem('guardianMessages', JSON.stringify(guardianMessages));
  }, [guardianMessages]);

  React.useEffect(() => {
    localStorage.setItem('dailyLetter', JSON.stringify(dailyLetter));
  }, [dailyLetter]);

  React.useEffect(() => {
    localStorage.setItem('dailyLetterDate', JSON.stringify(dailyLetterDate));
  }, [dailyLetterDate]);

  React.useEffect(() => {
    localStorage.setItem('dailyRewardDate', JSON.stringify(dailyRewardDate));
  }, [dailyRewardDate]);

  React.useEffect(() => {
    localStorage.setItem('checkInStreak', JSON.stringify(checkInStreak));
  }, [checkInStreak]);

  React.useEffect(() => {
    localStorage.setItem('lastCheckInDate', JSON.stringify(lastCheckInDate));
  }, [lastCheckInDate]);

  React.useEffect(() => {
    localStorage.setItem('membership', JSON.stringify(membership));
  }, [membership]);

  React.useEffect(() => {
    localStorage.setItem('engagement', JSON.stringify(engagement));
  }, [engagement]);

  React.useEffect(() => {
    localStorage.setItem('appEvents', JSON.stringify(appEvents));
  }, [appEvents]);

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      saveAutoRecoveryPoint('auto').catch(() => undefined);
    }, 2600);

    return () => window.clearTimeout(handle);
  }, [
    messages,
    baziResult,
    baziMessages,
    profiles,
    tarotReadings,
    simulationHistory,
    diaryEntries,
    reviewHistory,
    guardianMessages,
    membership,
    energy,
  ]);

  return (
    <AppContext.Provider value={{
      bondExp, setBondExp,
      bondLevel, setBondLevel,
      energy, setEnergy,
      fragments, setFragments,
      messages, setMessages,
      cardImage, setCardImage,
      communityPosts, setCommunityPosts,
      settings, setSettings,
      userName, setUserName,
      userAvatar, setUserAvatar,
      companionOutfit, setCompanionOutfit,
      theme, setTheme,
      baziResult, setBaziResult,
      baziFormData, setBaziFormData,
      baziMessages, setBaziMessages,
      profiles, setProfiles,
      activeProfileId, setActiveProfileId,
      simulatorState, setSimulatorState,
      tarotReadings, setTarotReadings,
      simulationHistory, setSimulationHistory,
      diaryEntries, setDiaryEntries,
      reviewHistory, setReviewHistory,
      guardianMessages, setGuardianMessages,
      dailyLetter, setDailyLetter,
      dailyLetterDate, setDailyLetterDate,
      dailyRewardDate, setDailyRewardDate,
      checkInStreak, setCheckInStreak,
      lastCheckInDate, setLastCheckInDate,
      membership, setMembership,
      engagement, setEngagement,
      appEvents, setAppEvents
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};
