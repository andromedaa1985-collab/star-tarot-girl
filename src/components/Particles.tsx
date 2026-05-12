import React, { useMemo } from 'react';
import { motion } from 'motion/react';

export default function Particles() {
  const orbs = useMemo(() => {
    return [
      { 
        id: 1, 
        size: '80vw', 
        color: 'from-[#A0C4FF] to-[#BDB2FF] dark:from-[#312E81] dark:to-[#1E3A8A]', 
        initialX: '-10%', 
        initialY: '-20%', 
        duration: 20,
        xMove: ['0%', '10%', '-5%', '0%'],
        yMove: ['0%', '5%', '-10%', '0%']
      },
      { 
        id: 2, 
        size: '80vw', 
        color: 'from-[#FFC6FF] to-[#FFADAD] dark:from-[#831843] dark:to-[#4C1D95]', 
        initialX: '40%', 
        initialY: '60%', 
        duration: 25,
        xMove: ['0%', '-15%', '5%', '0%'],
        yMove: ['0%', '-10%', '10%', '0%']
      },
      { 
        id: 3, 
        size: '60vw', 
        color: 'from-[#9BF6FF] to-[#CAFFBF] dark:from-[#064E3B] dark:to-[#065F46]', 
        initialX: '50%', 
        initialY: '10%', 
        duration: 22,
        xMove: ['0%', '-10%', '15%', '0%'],
        yMove: ['0%', '15%', '-5%', '0%']
      },
      { 
        id: 4, 
        size: '70vw', 
        color: 'from-[#FDFFB6] to-[#FFD6A5] dark:from-[#78350F] dark:to-[#451A03]', 
        initialX: '-10%', 
        initialY: '50%', 
        duration: 28,
        xMove: ['0%', '15%', '-10%', '0%'],
        yMove: ['0%', '-15%', '5%', '0%']
      },
    ];
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {orbs.map((orb) => (
        <motion.div
          key={orb.id}
          className={`absolute rounded-full bg-gradient-to-br ${orb.color} filter blur-[80px] opacity-60 dark:opacity-40 transition-colors duration-1000`}
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.initialX,
            top: orb.initialY,
          }}
          animate={{
            x: orb.xMove,
            y: orb.yMove,
            scale: [1, 1.1, 0.9, 1],
          }}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
