/* eslint-disable no-console */

const shell = process.env.SHELL || "";

const detectShell = () => {
  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("bash")) return "bash";
  if (shell.includes("fish")) return "fish";
  return null;
};

const detected = detectShell();

console.log("");
console.log("✔ autotyper installed");
console.log("");
console.log("Optional: enable shell tab completion (one-time)");

if (detected) {
  console.log("");
  console.log(`Detected shell: ${detected}`);
  console.log("");
  console.log(`  autotyper completion install`);
} else {
  console.log("");
  console.log("Run one of the following:");
  console.log("");
  console.log("  autotyper completion install --shell bash");
  console.log("  autotyper completion install --shell zsh");
  console.log("  autotyper completion install --shell fish");
}

console.log("");
console.log("After installation, open a new terminal and try:");
console.log("  autotyper --z<TAB>");
console.log("");
