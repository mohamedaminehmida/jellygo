<div align="center">
  <h1>🟢 Jelly Go! - Multiplayer Web Remake 🔴</h1>
  <p>A real-time, multiplayer web browser remake of the classic flash game <b>Jelly Go!</b>, built entirely from scratch using HTML5 Canvas, Vanilla JavaScript, Node.js, and Socket.io.</p>
</div>

---

This project aims to recreate the fast-paced strategy and troop-management mechanics of the original game while introducing a seamless, synchronized multiplayer experience.

## ✨ Features & What's Done
We have rebuilt the core engine and visual rendering from the ground up:

* **Real-Time Multiplayer:** Full client-server synchronization using Socket.io, handling multiple players, troop dispatching, and base capturing in real-time.
* **Custom Physics Engine:** Fluid troop movement, collision detection, and repulsive bouncing physics when packages navigate around obstacles.
* **4 Distinct Unit Types:** 
  * **Basics & Factories:** Standard jelly generation and capacity upgrades.
  * **Forts:** Automated defensive structures that fire homing projectiles at incoming enemy packages.
  * **Labs:** Specialized units capable of brewing status-altering potions (Freeze, Virus, and Capture).
* **Pixel-Perfect Vector Graphics:** Custom SVG paths seamlessly integrated and scaled within dynamic canvas hit-circles, completely decoupling physical hitboxes from visual rendering.
* **Dynamic Animations & AI:** Units feature state-aware animations—neutral units sleep (with "Zzz" effects), awake units glance around suspiciously at randomized intervals, and bases automatically calculate incoming troop speeds to flash a "Help!" bubble if capture is mathematically imminent. 

## 🚀 What's Next (Roadmap)
* **Custom Map Editor:** A robust, drag-and-drop map creation tool allowing users to build, mirror, and export custom map codes to play with friends.
* **Lobby Enhancements:** Expanding the pre-game lobby for smoother room code sharing and team selection.
* **Balancing & Polish:** Fine-tuning troop speeds, production rates, and upgrade costs for optimal competitive gameplay.

## 🎮 How to Play Locally

To test the game and run a local server on your machine:

1. **Install Node.js** (if you haven't already).
2. **Download or Clone** this repository to your computer.
3. **Open your Command Prompt (cmd)** or terminal.
4. **Navigate to the folder** where you saved the game:
   ```bash
   cd C:\path\to\your\folder\jellygo
