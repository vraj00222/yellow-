import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { prefersReduced } from '../anim';

/**
 * InsForge-style backdrop: flat charcoal with a faint mint bloom that breathes
 * near the top. No grid — the dashboard surface is flat, matching InsForge.
 */
export function Ambient() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (prefersReduced()) return;
    const ctx = gsap.context(() => {
      gsap.to('.amb__glow', {
        opacity: 0.7,
        scale: 1.06,
        duration: 7,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <div className="amb" ref={ref} aria-hidden="true">
      <div className="amb__glow" />
    </div>
  );
}
