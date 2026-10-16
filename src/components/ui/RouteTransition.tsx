import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { getNavigationDirection, MOTION_DURATION, MOTION_EASE } from '../../lib/uiMotion';

const RouteMotionContext = createContext<-1 | 0 | 1>(0);
export const useRouteMotionDirection = () => useContext(RouteMotionContext);

export default function RouteTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const reducedMotion = useReducedMotion();
  const route = useRef({ pathname, direction: 0 as -1 | 0 | 1 });
  const direction = route.current.pathname === pathname
    ? route.current.direction
    : getNavigationDirection(route.current.pathname, pathname);
  useLayoutEffect(() => { route.current = { pathname, direction }; }, [pathname, direction]);

  return (
    <RouteMotionContext.Provider value={direction}>
      {/* Only fade the page root. A transform here would re-anchor fixed overlays. */}
      <motion.div
        key={pathname}
        className="rail-route-view"
        data-route-direction={direction}
        initial={reducedMotion || direction === 0 ? false : { opacity: 0.65 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.fast, ease: MOTION_EASE }}
      >
        {children}
      </motion.div>
    </RouteMotionContext.Provider>
  );
}
