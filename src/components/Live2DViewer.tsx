import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';

interface Live2DViewerProps {
  modelUrl: string;
  className?: string;
}

export default function Live2DViewer({ modelUrl, className }: Live2DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;
    let model: any;

    const initLive2D = async () => {
      try {
        // 1. Expose PIXI to window BEFORE importing pixi-live2d-display
        (window as any).PIXI = PIXI;
        
        // 2. Dynamically import ONLY the Cubism 4 module to avoid Cubism 2 runtime errors
        const { Live2DModel } = await import('pixi-live2d-display/cubism4');

        if (!isMounted) return;

        // 3. Create PIXI App (Let PIXI create the canvas to avoid React Strict Mode double-mount issues)
        const app = new PIXI.Application({
          backgroundAlpha: 0,
          resizeTo: containerRef.current as HTMLElement,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });
        appRef.current = app;
        
        // Append canvas to container
        containerRef.current.appendChild(app.view as unknown as HTMLElement);

        // 4. Load the model
        model = await Live2DModel.from(modelUrl);
        
        if (!isMounted) {
          model.destroy();
          app.destroy(true, { children: true });
          return;
        }
        
        app.stage.addChild(model as any);

        // 5. Fit model to screen
        const updateTransform = () => {
          if (!app || !model) return;
          const scaleX = (app.renderer.width * 0.9) / model.width;
          const scaleY = (app.renderer.height * 0.9) / model.height;
          const scale = Math.min(scaleX, scaleY);
          
          model.scale.set(scale);
          model.anchor.set(0.5, 0.5);
          
          // Position it at the center
          model.position.set(app.renderer.width / 2, app.renderer.height / 2 + (model.height * scale * 0.15));
        };

        updateTransform();
        
        // Update on resize
        app.renderer.on('resize', updateTransform);

        // 6. Make it interactive
        model.on('pointerdown', (hitAreas: string[]) => {
          if (hitAreas.includes('head')) {
            model.expression();
          } else {
            model.motion('tap_body');
          }
        });

        setLoading(false);
      } catch (err: any) {
        console.error("Failed to load Live2D model:", err);
        if (isMounted) {
          setError(err.message || "模型加载失败，请检查网络");
          setLoading(false);
        }
      }
    };

    initLive2D();

    return () => {
      isMounted = false;
      if (model) {
        model.destroy();
      }
      if (appRef.current) {
        // Destroy the app and remove the canvas element
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, [modelUrl]);

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-hidden flex items-center justify-center ${className || ''}`}>
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-[#007AFF] z-10 bg-white/30 backdrop-blur-sm">
          <div className="w-6 h-6 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin mb-2"></div>
          <span className="text-xs font-medium">唤醒角色中...</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500 text-xs text-center p-4 z-10 bg-white/50 backdrop-blur-sm">
          {error}
        </div>
      )}
    </div>
  );
}
