import { useEffect, useRef } from "react";

export default function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    let animationFrameId = 0;
    const particles = [];
    const colors = ["rgba(56,189,248,", "rgba(99,102,241,", "rgba(20,184,166,"];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    for (let index = 0; index < 80; index += 1) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.5 + 0.3,
        alpha: Math.random() * 0.6 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const draw = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (let particleIndex = 0; particleIndex < particles.length; particleIndex += 1) {
        const particle = particles[particleIndex];

        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0) {
          particle.x = canvas.width;
        }
        if (particle.x > canvas.width) {
          particle.x = 0;
        }
        if (particle.y < 0) {
          particle.y = canvas.height;
        }
        if (particle.y > canvas.height) {
          particle.y = 0;
        }

        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = `${particle.color}${particle.alpha})`;
        context.fill();

        for (let siblingIndex = particleIndex + 1; siblingIndex < particles.length; siblingIndex += 1) {
          const sibling = particles[siblingIndex];
          const deltaX = particle.x - sibling.x;
          const deltaY = particle.y - sibling.y;
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

          if (distance < 100) {
            context.beginPath();
            context.strokeStyle = `rgba(56,189,248,${0.05 * (1 - distance / 100)})`;
            context.lineWidth = 0.5;
            context.moveTo(particle.x, particle.y);
            context.lineTo(sibling.x, sibling.y);
            context.stroke();
          }
        }
      }

      animationFrameId = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} id="particle-canvas" />;
}
