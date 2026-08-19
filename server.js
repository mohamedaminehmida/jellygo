const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const BUILDING_CONFIGS = { 
    basic: { 
        maxJellies: 10, 
        prodRate: 0.05, 
        upgrades: [{ target: 'building', cost: 5 }, 
                   { target: 'fort', cost: 10 }, 
                   { target: 'lab', cost: 10 }] },
    building: { 
        1: { maxJellies: 10 , prodRate: 0.08, upgradeCost: 5 }, 
        2: { maxJellies: 20 , prodRate: 0.12, upgradeCost: 10 }, 
        3: { maxJellies: 30 , prodRate: 0.16, upgradeCost: 20 }, 
        4: { maxJellies: 40 , prodRate: 0.20, upgradeCost: 30 }, 
       5: { maxJellies: 50 , prodRate: 0.25, upgradeCost: null } },
    fort: { 
        1: { maxJellies: 60, prodRate: 0.0, defense: 3.0, upgradeCost: 20, cooldownTicks: 20 }, // 2 seconds
        2: { maxJellies: 80, prodRate: 0.0, defense: 3.5, upgradeCost: 25, cooldownTicks: 15 }, 
        3: { maxJellies: 100, prodRate: 0.0, defense: 4.0, upgradeCost: null, cooldownTicks: 10 } // 1.0 second  
    },
    lab: {  
        1: { maxJellies: 50 , prodRate: 0.0 , upgradeCost: 15 }, 
        2: { maxJellies: 100, prodRate: 0.0 , upgradeCost: 20 }, 
        3: { maxJellies: 150, prodRate: 0.0 , upgradeCost: null } }
};

const POTION_CONFIGS = { 
    freeze: { cost: 25, craftDurationTicks: 50 }, 
    virus: { cost: 30, craftDurationTicks: 80 }, 
    red: { cost: 50, craftDurationTicks: 120 } };

// Dictionary to hold all active matches
let rooms = {}; 

// Helper function to generate a 5-letter room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Generates the standard game map
function createDefaultMap() {
    return {
        buildings: [
            { id: 1, x: 150, y: 300, radius: 35, ownerId: 1, jellyCount: 15, type: 'building', level: 1, status: 'normal', activePotion: null, potionProgress: 0, potionRatio: 0, helpTimer: 0 },
            { id: 2, x: 650, y: 300, radius: 35, ownerId: 2, jellyCount: 15, type: 'building', level: 1, status: 'normal', activePotion: null, potionProgress: 0, potionRatio: 0, helpTimer: 0 },
            { id: 3, x: 400, y: 150, radius: 35, ownerId: 0, jellyCount: 5,  type: 'basic', level: 1, status: 'normal', activePotion: null, potionProgress: 0, potionRatio: 0, helpTimer: 0 },
            { id: 4, x: 400, y: 450, radius: 35, ownerId: 0, jellyCount: 5,  type: 'basic', level: 1, status: 'normal', activePotion: null, potionProgress: 0, potionRatio: 0, helpTimer: 0 }        ],
        packages: [], 
        projectiles: []  
    };
}

// Utility to find which room a socket is in
function getPlayerRoom(socket) {
    return Array.from(socket.rooms).find(r => r !== socket.id);
}

io.on('connection', (socket) => {
    
// --- LOBBY SYSTEM ---
    socket.on('createRoom', (data) => {
        const username = data.username;
        const mapCode = data.mapCode;
        const roomCode = generateRoomCode();
        socket.join(roomCode);
        
        let customState = null;

        if (mapCode) {
            try {
                const decodedStr = Buffer.from(mapCode, 'base64').toString('utf8');
                const parsedBuildings = JSON.parse(decodedStr);
                
                if (Array.isArray(parsedBuildings) && parsedBuildings.length > 0) {
                    // [NEW FIX] Sanitize and lock the map data instantly upon loading
                    parsedBuildings.forEach(b => {
                        if (b.type === 'basic') {
                            b.level = 1; // Basic units never have levels
                        } else if (BUILDING_CONFIGS[b.type]) {
                            // Find the highest available level for this specific type (e.g., Lab is 3)
                            const availableLevels = Object.keys(BUILDING_CONFIGS[b.type]).map(Number).filter(n => !isNaN(n));
                            const maxLevel = Math.max(...availableLevels);
                            
                            // If the level from the editor is higher than the max, clamp it down
                            if (b.level > maxLevel || !BUILDING_CONFIGS[b.type][b.level]) {
                                b.level = maxLevel; 
                            }
                        }
                    });

                    customState = {
                        buildings: parsedBuildings,
                        packages: [],
                        projectiles: []
                    };
                    console.log(`🗺️ Custom Map Loaded for Room ${roomCode}`);
                }
            } catch (e) {
                console.log(`⚠️ Invalid map code provided for Room ${roomCode}. Falling back to default.`);
            }
        }
        
        rooms[roomCode] = {
            host: socket.id,
            players: {}, 
            availableIds: [1, 2, 3, 4],
            state: customState || createDefaultMap(),
            playing: false
        };
        
        const playerId = rooms[roomCode].availableIds.shift();
        rooms[roomCode].players[socket.id] = { name: username || 'Host', id: playerId };
        
        socket.emit('roomCreated', roomCode);
        io.to(roomCode).emit('lobbyUpdate', { players: Object.values(rooms[roomCode].players), host: rooms[roomCode].host });
        socket.emit('initPlayer', playerId);
    });

    socket.on('joinRoom', (data) => {
        const code = data.roomCode.toUpperCase();
        const room = rooms[code];

        if (room && !room.playing && room.availableIds.length > 0) {
            socket.join(code);
            const playerId = room.availableIds.shift();
            room.players[socket.id] = { name: data.username || `Player ${playerId}`, id: playerId };
            
            socket.emit('roomJoined', code);
            io.to(code).emit('lobbyUpdate', { players: Object.values(room.players), host: room.host });
            socket.emit('initPlayer', playerId);
        } else {
            socket.emit('errorMsg', "Room full, not found, or already started.");
        }
    });

    socket.on('startGame', () => {
        const roomCode = getPlayerRoom(socket);
        if (roomCode && rooms[roomCode] && rooms[roomCode].host === socket.id) {
            rooms[roomCode].playing = true;
            io.to(roomCode).emit('gameStarted', rooms[roomCode].state);
        }
    });

// --- GAME ACTIONS ---
    socket.on('playerAction', (action) => {
        const roomCode = getPlayerRoom(socket);
        if (!roomCode || !rooms[roomCode] || !rooms[roomCode].playing) return;
        
        const state = rooms[roomCode].state;

        // 1. Gérer les améliorations
        if (action.action === 'UPGRADE') {
            const b = state.buildings.find(b => b.id === action.buildingId);
            if (!b) return;

            if (b.type === 'basic') {
                const opt = BUILDING_CONFIGS.basic.upgrades.find(u => u.target === action.targetType);
                if (opt && b.jellyCount >= opt.cost) {
                    b.jellyCount -= opt.cost;
                    b.type = action.targetType;
                    b.level = 1;
                }
            } else if (['building', 'fort', 'lab'].includes(b.type)) {
                const config = BUILDING_CONFIGS[b.type][b.level];
                if (config && config.upgradeCost !== null && b.jellyCount >= config.upgradeCost) {
                    b.jellyCount -= config.upgradeCost;
                    b.level += 1;
                }
            }
        }

        // 2. Gérer la préparation des potions
        if (action.action === 'PREPARE_POTION') {
            const b = state.buildings.find(b => b.id === action.buildingId);
            if (b && b.type === 'lab' && !b.activePotion) {
                const pConfig = POTION_CONFIGS[action.potionType];
                if (pConfig && b.jellyCount >= pConfig.cost) {
                    b.activePotion = { type: action.potionType, ready: false };
                    b.potionProgress = 0;
                    b.potionRatio = 0;
                }
            }
        }

        // 3. Gérer l'annulation des potions [CORRIGÉ]
        if (action.action === 'CANCEL_POTION') {
            const b = state.buildings.find(b => b.id === action.buildingId);
            if (b && b.type === 'lab' && b.activePotion) {
                b.activePotion = null;
                b.potionProgress = 0;
                b.potionRatio = 0;
            }
        }

        // 4. Gérer l'envoi des troupes
if (action.action === 'SEND_TROOPS') {
            const senderId = rooms[roomCode].players[socket.id].id;
            const target = state.buildings.find(b => b.id === action.targetId);

            if (target) {
                // Smart multiplier: if client sends 0.5, use 0.5. If client sends 50, do 50/100.
                let rawPerc = action.percentage || 0.5;
                let multiplier = rawPerc > 1 ? rawPerc / 100 : rawPerc; 

                action.sourceIds.forEach(id => {
                    const building = state.buildings.find(b => b.id === id);
                    
                    if (building && building.ownerId === senderId && building.jellyCount > 0) {
                        const amount = Math.floor(building.jellyCount * multiplier);
                        
                        if (amount > 0) {
                        building.jellyCount -= amount;
                        let maxSpd = 8;
                        if (building.type === 'lab') maxSpd = 12;
                        if (building.type === 'fort') maxSpd = 5;

                        // --- SERVER-SIDE HELP PREDICTION ---
                        if (target.ownerId !== senderId) {
                            let dist = Math.hypot(target.x - building.x, target.y - building.y);
                            let ticksToImpact = dist / maxSpd;
                            
                            let prodRate = 0;
                            // Only real players produce jellies
                            if (target.ownerId > 0) {
                                if (target.type === 'basic') prodRate = BUILDING_CONFIGS.basic.prodRate;
                                else if (BUILDING_CONFIGS[target.type] && BUILDING_CONFIGS[target.type][target.level]) {
                                    prodRate = BUILDING_CONFIGS[target.type][target.level].prodRate;
                                }
                            }
                            
                            let predictedDefense = target.jellyCount + (ticksToImpact * prodRate);
                            let incomingAttack = amount;
                            
                            // Forts dampen the incoming attack value
                            if (target.type === 'fort') {
                                let def = BUILDING_CONFIGS.fort[target.level] ? BUILDING_CONFIGS.fort[target.level].defense : 2.0;
                                incomingAttack /= def;
                            }
                            
                            // 20 ticks = 2 seconds of Help! bubble
                            if (incomingAttack > predictedDefense) {
                                target.helpTimer = 20; 
                            }
                        }

                        state.packages.push({
                            id: Math.random().toString(36).substr(2, 9),
                            x: building.x,
                            y: building.y,
                            sourceId: building.id,
                            targetId: action.targetId,
                            ownerId: building.ownerId,
                            jellyCount: amount,
                            maxSpeed: maxSpd,
                            currentSpeed: 1,
                            acceleration: (maxSpd - 1) / 7,
                            vx: 0,
                            vy: 0
                        });
                    }
                    }
                });
            }
        }

        // 5. Gérer l'utilisation d'une potion prête sur une cible
if (action.action === 'USE_POTION') {
            const lab = state.buildings.find(b => b.id === action.labId);
            const target = state.buildings.find(b => b.id === action.targetId);
            const senderId = rooms[roomCode].players[socket.id].id;

            // 1. Ensure Lab exists, is owned by sender, has a ready potion, and isn't targeting itself
            if (lab && lab.type === 'lab' && lab.ownerId === senderId && lab.activePotion && lab.activePotion.ready && target && target.ownerId !== senderId) {
                const pType = lab.activePotion.type;
                const cost = POTION_CONFIGS[pType].cost;

                // 2. Check if the lab actually has enough jellies to fire the potion
                if (lab.jellyCount >= cost) {
                    let isValidTarget = false;

                    // 3. Targeting Rules
                    if ((pType === 'freeze' || pType === 'virus') && target.ownerId > 0) {
                        // Freeze and Virus can ONLY hit real enemy players (> 0)
                        isValidTarget = true; 
                    } else if (pType === 'red') {
                        // Red potion can hit ANYONE except yourself (checked above), including neutrals (0) and frozen (-1)
                        isValidTarget = true; 
                    }

                    if (isValidTarget) {
                        // 4. Deduct the cost from the lab at the exact moment of use!
                        lab.jellyCount -= cost;

                        // Apply potion effects
                        if (pType === 'freeze') {
                            target.ownerId = -1; // Give to dummy "Freeze" player
                            target.status = 'frozen';
                            target.activePotion = null;
                            target.potionProgress = 0;
                            target.potionRatio = 0;
                        } else if (pType === 'virus') {
                            target.status = 'sick';
                        } else if (pType === 'red') {
                            target.ownerId = lab.ownerId; // Capture it!
                            target.status = 'normal';
                            target.activePotion = null;
                            target.potionProgress = 0;
                            target.potionRatio = 0;
                        }

                        // Wipe the used potion from the lab
                        lab.activePotion = null;
                        lab.potionProgress = 0;
                        lab.potionRatio = 0;
                    }
                }
            }
        }
    });

    socket.on('disconnect', () => {
        // Find which room this socket was in and clean up
        for (let code in rooms) {
            if (rooms[code].players[socket.id]) {
                const idToFree = rooms[code].players[socket.id].id;
                rooms[code].availableIds.push(idToFree);
                rooms[code].availableIds.sort();
                delete rooms[code].players[socket.id];
                
                io.to(code).emit('lobbyUpdate', { players: Object.values(rooms[code].players), host: rooms[code].host });
                
                // If room is empty, delete it from memory
                if (Object.keys(rooms[code].players).length === 0) {
                    delete rooms[code];
                }
                break;
            }
        }
    });
});

// --- MAIN SERVER LOGIC LOOP ---
// --- MAIN SERVER LOGIC LOOP (Physics & Physics) ---
setInterval(() => {
    for (let code in rooms) {
        let room = rooms[code];
        if (!room.playing) continue; 

        // 1. Clear previous frame's visual lasers
        room.state.lasers = [];

        // 2. Building Logic (Production, Decay, Potions)
        room.state.buildings.forEach(b => {
            if (b.helpTimer > 0) b.helpTimer--; // Count down the Help bubble
            if (b.status === 'sick') { b.jellyCount = Math.max(0, b.jellyCount - 0.1); return; }
            if (b.status === 'frozen') return;

            if (b.type === 'lab' && b.activePotion) {
                const pConfig = POTION_CONFIGS[b.activePotion.type];
                if (b.jellyCount < pConfig.cost) {
                    b.activePotion = null; b.potionProgress = 0; b.potionRatio = 0;
                } else if (!b.activePotion.ready) {
                    b.potionProgress += 1;
                    b.potionRatio = b.potionProgress / pConfig.craftDurationTicks;
                    if (b.potionProgress >= pConfig.craftDurationTicks) {
                        b.activePotion.ready = true; b.potionRatio = 1;
                    }
                }
            }

            // [FIX] Only real players (ID 1, 2, 3, 4) produce/decay. 
            // Neutrals (0) and Frozen (-1) do nothing.
            if (b.ownerId > 0) {
                let max, rate;
                
                if (b.type === 'basic') {
                    max = BUILDING_CONFIGS.basic.maxJellies;
                    rate = BUILDING_CONFIGS.basic.prodRate;
                } else {
                    // Smart Fallback
                    if (!BUILDING_CONFIGS[b.type][b.level]) {
                        const availableLevels = Object.keys(BUILDING_CONFIGS[b.type]).map(Number).filter(n => !isNaN(n));
                        b.level = Math.max(...availableLevels); 
                    }
                    max = BUILDING_CONFIGS[b.type][b.level].maxJellies;
                    rate = BUILDING_CONFIGS[b.type][b.level].prodRate;
                }

                if (b.maxJelliesOverride) {
                    max = b.maxJelliesOverride;
                }

                if (b.jellyCount > max) {
                    b.jellyCount = Math.max(max, b.jellyCount - 0.1);
                } else if (b.jellyCount < max && (b.type === 'basic' || b.type === 'building')) {
                    b.jellyCount = Math.min(max, b.jellyCount + rate);
                }
            }
        });

// 3. Move Packages & Handle Capture Math
        for (let i = room.state.packages.length - 1; i >= 0; i--) {
            let p = room.state.packages[i];
            const target = room.state.buildings.find(b => b.id === p.targetId);
            
            if (!target) { room.state.packages.splice(i, 1); continue; }

            const dx = target.x - p.x;
            const dy = target.y - p.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // Has it arrived?
            if (dist <= target.radius) {
                if (target.ownerId === p.ownerId) {
                    target.jellyCount += p.jellyCount;
                } else {
                    target.jellyCount -= p.jellyCount;
                    if (target.jellyCount < 0) {
                        target.ownerId = p.ownerId;
                        target.jellyCount = Math.abs(target.jellyCount); 
                        target.activePotion = null;
                        target.potionProgress = 0;
                        target.potionRatio = 0;
                        target.status = 'normal';
                    }
                }
                room.state.packages.splice(i, 1);
                continue; 
            } 
            
            // ==========================================
            // SAFE PHYSICS ENGINE
            // ==========================================

            if (p.currentSpeed < p.maxSpeed) {
                p.currentSpeed = Math.min(p.maxSpeed, p.currentSpeed + p.acceleration);
            }

            // Fallback to prevent NaN if distance is somehow 0
            let safeDist = dist === 0 ? 0.001 : dist;
            let dirX = dx / safeDist; 
            let dirY = dy / safeDist;

// --- 3. Calculate Repulsion & BOUNCE ---
            let repX = 0;
            let repY = 0;
            const avoidancePadding = 8; // La zone où il commence à glisser

            room.state.buildings.forEach(b => {
                if (b.id === target.id || b.id === p.sourceId) return; 

                let bx = p.x - b.x;
                let by = p.y - b.y;
                let bDist = Math.sqrt(bx * bx + by * by);
                
                if (bDist === 0) {
                    bx = 0.1; by = 0.1; bDist = 0.14; 
                }

                let avoidRadius = b.radius + avoidancePadding;

                if (bDist < avoidRadius) {
                    let strength = (avoidRadius - bDist) / avoidRadius;
                    
                    let normX = bx / bDist;
                    let normY = by / bDist;
                    
                    let tan1X = -normY;
                    let tan1Y = normX;
                    let tan2X = normY;
                    let tan2Y = -normX;
                    
                    let dot1 = tan1X * dirX + tan1Y * dirY;
                    let dot2 = tan2X * dirX + tan2Y * dirY;
                    
                    let bestTanX, bestTanY;

                    // Briseur de Symétrie
                    if (Math.abs(dot1 - dot2) < 0.05) {
                        const parity = p.id.charCodeAt(0) % 2 === 0;
                        bestTanX = parity ? tan1X : tan2X;
                        bestTanY = parity ? tan1Y : tan2Y;
                    } else {
                        bestTanX = dot1 > dot2 ? tan1X : tan2X;
                        bestTanY = dot1 > dot2 ? tan1Y : tan2Y;
                    }
                    
                    // [NEW] Mécanique de Rebond Physique !
                    let outwardForce = 1.5; // Force de glissement normale
                    let slideForce = 8; // Force de glissement tangentielle
                    
                    // Si le package percute physiquement le bâtiment (à moins de 3 pixels du bord)
                    if (bDist < b.radius + 3) {
                        // Force de répulsion massive pour simuler le choc physique (le projette en arrière)
                        outwardForce = 20.0; 
                        // Transfert d'énergie : il perd sa vitesse à l'impact et devra réaccélérer avec l'inertie
                        p.currentSpeed = Math.max(2, p.currentSpeed * 0.7); 
                    }
                    
                    repX += (normX * outwardForce + bestTanX * slideForce) * strength; 
                    repY += (normY * outwardForce + bestTanY * slideForce) * strength;
                }
            });

            let finalVx = dirX + repX;
            let finalVy = dirY + repY;
            let finalDist = Math.sqrt(finalVx * finalVx + finalVy * finalVy);

            if (finalDist > 0) {
                p.vx = (finalVx / finalDist) * p.currentSpeed;
                p.vy = (finalVy / finalDist) * p.currentSpeed;
            }

            p.x += p.vx;
            p.y += p.vy;
        }
// 4. Fort Defenses (Spawning Homing Projectiles)
        room.state.buildings.forEach(b => {
            // [FIX] The Fort will ONLY shoot if owned by a real player (> 0) and NOT frozen
            if (b.type === 'fort' && b.ownerId > 0 && b.status !== 'frozen') {
                if (b.currentCooldown === undefined) b.currentCooldown = 0;
                
                if (b.currentCooldown > 0) {
                    b.currentCooldown--;
                    return; 
                }

                const attackRadius = b.radius * 2.5;
                let nearestPackage = null;
                let minDist = attackRadius;
                
                room.state.packages.forEach(p => {
                    if (p.ownerId !== b.ownerId) {
                        const pDist = Math.sqrt(Math.pow(p.x - b.x, 2) + Math.pow(p.y - b.y, 2));
                        if (pDist <= minDist) {
                            minDist = pDist;
                            nearestPackage = p;
                        }
                    }
                });
                
                if (nearestPackage) {
                    // Spawn a tracking projectile instead of dealing instant damage
                    room.state.projectiles.push({
                        id: Math.random().toString(36).substr(2, 9),
                        x: b.x, 
                        y: b.y,
                        targetPackageId: nearestPackage.id,
                        ownerId: b.ownerId,
                        speed: 12, // Faster than normal packages (which are speed 8)
                        damage: 2
                    });
                    
                    const config = BUILDING_CONFIGS.fort[b.level] || BUILDING_CONFIGS.fort[1];
                    b.currentCooldown = config.cooldownTicks;
                }
            }
        });

        // 5. Move Projectiles & Handle Hits
        for (let i = room.state.projectiles.length - 1; i >= 0; i--) {
            let proj = room.state.projectiles[i];
            const targetPkg = room.state.packages.find(p => p.id === proj.targetPackageId);
            
            // If the package was destroyed or captured a base before the projectile hit it, destroy the projectile
            if (!targetPkg) {
                room.state.projectiles.splice(i, 1);
                continue;
            }
            
            const dx = targetPkg.x - proj.x;
            const dy = targetPkg.y - proj.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // If it hits the package (14 is the visual radius of the package)
            if (dist <= 14) {
                targetPkg.jellyCount -= proj.damage;
                room.state.projectiles.splice(i, 1); // Delete projectile on impact
            } else {
                // Keep homing in on the package, even if outside the Fort's radius!
                const angle = Math.atan2(dy, dx);
                proj.x += Math.cos(angle) * proj.speed;
                proj.y += Math.sin(angle) * proj.speed;
            }
        }

        // 6. Clean up destroyed packages (moved to the very end so projectiles can hit them first)
        room.state.packages = room.state.packages.filter(p => p.jellyCount > 0);

        io.to(code).emit('syncState', room.state);
    }
}, 100);

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
