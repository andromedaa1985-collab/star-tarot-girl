import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2, Shield, Bell, HelpCircle, LogOut, Compass } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppContext } from '../store';

export default function Settings() {
  const navigate = useNavigate();
  const { setMessages, setCardImage, setBondExp, setBondLevel, setEnergy, setFragments } = useAppContext();
  
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleClearData = () => {
    localStorage.clear();
    setShowClearConfirm(false);
    setShowSuccessToast(true);
    setTimeout(() => {
      window.location.href = '/app';
    }, 1500);
  };

  return (
    <div className="relative h-full w-full overflow-y-auto overscroll-contain px-6 pt-4 pb-40 text-apple-text no-scrollbar">
      <div className="flex items-center mb-8">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-apple-surface-hover transition-colors text-apple-text"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-sans text-2xl font-bold tracking-widest text-[#6B8AFF] ml-2">设置</h1>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-6"
      >
        {/* Account Section */}
        <div className="bg-apple-surface backdrop-blur-xl rounded-3xl overflow-hidden border border-apple-border shadow-[0_14px_38px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="px-5 py-3 bg-apple-surface border-b border-apple-border">
            <span className="text-xs font-medium text-apple-text-muted tracking-widest">账号与隐私</span>
          </div>
          <SettingRow icon={<Shield size={18} />} title="隐私设置" onClick={() => navigate('/app/settings/privacy')} />
          <SettingRow icon={<Bell size={18} />} title="通知管理" onClick={() => navigate('/app/settings/notifications')} />
        </div>

        {/* Data Section */}
        <div className="bg-apple-surface backdrop-blur-xl rounded-3xl overflow-hidden border border-apple-border shadow-[0_14px_38px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="px-5 py-3 bg-apple-surface border-b border-apple-border">
            <span className="text-xs font-medium text-apple-text-muted tracking-widest">数据管理</span>
          </div>
          <div 
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-3 p-5 hover:bg-apple-surface transition-colors cursor-pointer text-red-400"
          >
            <Trash2 size={18} />
            <span className="font-medium tracking-wide text-sm">清除所有数据</span>
          </div>
        </div>

        {/* Support Section */}
        <div className="bg-apple-surface backdrop-blur-xl rounded-3xl overflow-hidden border border-apple-border shadow-[0_14px_38px_rgba(117,82,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="px-5 py-3 bg-apple-surface border-b border-apple-border">
            <span className="text-xs font-medium text-apple-text-muted tracking-widest">支持与帮助</span>
          </div>
          <SettingRow icon={<HelpCircle size={18} />} title="帮助中心" onClick={() => navigate('/app/settings/help')} />
          <SettingRow icon={<Compass size={18} />} title="查看应用详情页" onClick={() => navigate('/')} />
          <SettingRow 
            icon={<LogOut size={18} />} 
            title="退出登录" 
            hasBorder={false} 
            onClick={() => setShowLogoutConfirm(true)} 
          />
        </div>
      </motion.div>

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-apple-surface backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center text-center border border-apple-border shadow-2xl"
            >
              <h3 className="font-sans font-bold text-2xl text-apple-text mb-4">清除所有数据</h3>
              <p className="text-apple-text-muted mb-8 text-sm">
                警告：此操作将清除所有聊天记录、收集的碎片、羁绊等级和能量。此操作不可逆，是否确认清除？
              </p>
              <div className="flex w-full gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-apple-surface-hover text-apple-text font-semibold hover:bg-apple-surface-hover transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={handleClearData}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold shadow-[0_4px_15px_rgba(239,68,68,0.3)] hover:bg-red-600 transition-colors"
                >
                  确认清除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showLogoutConfirm && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-apple-surface backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center text-center border border-apple-border shadow-2xl"
            >
              <h3 className="font-sans font-bold text-2xl text-apple-text mb-4">退出登录</h3>
              <p className="text-apple-text-muted mb-8 text-sm">
                确定要退出当前账号吗？
              </p>
              <div className="flex w-full gap-3">
                <button 
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-apple-surface-hover text-apple-text font-semibold hover:bg-apple-surface-hover transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    navigate('/');
                  }}
                  className="flex-1 py-3 rounded-xl bg-[#6B8AFF] text-white font-semibold shadow-[0_4px_15px_rgba(107,138,255,0.3)] hover:bg-[#4F46E5] transition-colors"
                >
                  确认退出
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showSuccessToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[#6B8AFF] text-white px-6 py-3 rounded-full text-sm font-medium shadow-[0_4px_15px_rgba(107,138,255,0.4)] z-[100]"
          >
            数据已清除
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingRow({ icon, title, hasBorder = true, onClick }: { icon: React.ReactNode, title: string, hasBorder?: boolean, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center justify-between p-5 hover:bg-apple-surface transition-colors cursor-pointer ${hasBorder ? 'border-b border-apple-border' : ''}`}
    >
      <div className="flex items-center gap-3 text-apple-text">
        {icon}
        <span className="font-medium tracking-wide text-sm">{title}</span>
      </div>
      <ChevronLeft size={18} className="text-apple-text-muted rotate-180" />
    </div>
  );
}
