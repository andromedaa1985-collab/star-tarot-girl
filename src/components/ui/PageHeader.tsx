import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useRouteMotionDirection } from './RouteTransition';
import { MOTION_DURATION, MOTION_EASE } from '../../lib/uiMotion';

export default function PageHeader({ eyebrow, title, description, action, backTo }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  backTo?: string;
}) {
  const direction = useRouteMotionDirection();
  const reducedMotion = useReducedMotion();
  return (
    <motion.header className="rail-page-header"
      initial={reducedMotion || direction === 0 ? false : { opacity: 0.65, x: direction * 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.standard, ease: MOTION_EASE }}
    >
      <div className="min-w-0">
        {backTo && <Link to={backTo} className="rail-back"><ArrowLeft size={16} aria-hidden="true" />返回</Link>}
        {eyebrow && <p className="rail-eyebrow">{eyebrow}</p>}
        <h1 className="rail-page-title">{title}</h1>
        {description && <p className="rail-page-description">{description}</p>}
      </div>
      {action && <div className="rail-header-action">{action}</div>}
    </motion.header>
  );
}
