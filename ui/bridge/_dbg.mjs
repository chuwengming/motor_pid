
import { MotorSimulator } from "./simulator.js";
const sim = new MotorSimulator();
sim.handle({ type: "control", cmd: "RUN" });
sim.handle({ type: "set_position", value: 90 });
for (let i = 0; i < 600; i++) {
  sim._tick();
  if (i % 50 === 0 || (i >= 100 && i <= 200 && i % 10 === 0)) {
    console.log(`t=${(i*10).toFixed(0)}ms  v=${sim.speed.toFixed(1)}  pos=${sim.position.toFixed(2)}  pwm=${sim.pwm.toFixed(1)}  spdCmd=${sim.spdCmd.toFixed(0)}`);
  }
}
