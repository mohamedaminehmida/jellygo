// ==========================================
// 1. INITIALISATION
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

// Dictionnaire des joueurs (0 = Neutre, 1 = Nous, 2 = Ennemi)
const players = {
    0: { color: '#bdc3c7', name: 'Neutre' },
    1: { color: '#3498db', name: 'Joueur 1 (Nous)' },
    2: { color: '#e74c3c', name: 'Joueur 2 (Ennemi)' }
};

// ==========================================
// 2. CLASSE BUILDING (Nœuds / Bâtiments)
// ==========================================
class Building {
    constructor(x, y, radius, ownerId=0,type=0, level=1 , count=0) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.ownerId = ownerId; 
        this.jellyCount = count; // Démarrage à 15 pour pouvoir tester les améliorations

        // Propriétés stratégiques
        this.type = type; // 1: 'basic', 2: 'building', 3: 'fort', 4: 'lab'
        this.level = level;
        this.status = status; // 'normal', 'sick', 'frozen'
    }

    // --- SYSTÈME D'AMÉLIORATION ---

    upgradeToFactory() {
        if (this.type === 0 && this.jellyCount >= 5) {
            this.jellyCount -= 5;
            this.type = 2; // Changement de type en 'factory'
            this.level = 1;
            return;
        }
        
        // Amélioration de niveau (1 -> 5)
        if (this.type === 2 && this.level < 5) {
            const upgradeCostsB = { 1: 5, 2: 10, 3: 20, 4: 30 };
            const cost = upgradeCostsB[this.level];
            
            if (this.jellyCount >= cost) {
                this.jellyCount -= cost;
                this.level++;
            }
        }
    }

    upgradeToFort() {
        if (this.type === 0 && this.jellyCount >= 10) {
            const upgradeCostsF = { 1: 10, 2: 15, 3: 20, 4: 25 };
            this.jellyCount -= 10;
            this.type = 3;
            this.level = 1; 
        }
    }

    upgradeToLab() {
        if (this.type === 0 && this.jellyCount >= 10) {
            const upgradeCostsL = { 1: 15, 2: 20};
            this.jellyCount -= 10;
            this.type = 4;
            this.level = 1;
        }
    }

    // --- COMPÉTENCES DU LABORATOIRE ---

    castSickPotion(targetBuilding) {
        if (this.type === 4 && this.jellyCount >= 30) {
            this.jellyCount -= 30;
            targetBuilding.status = 'sick';
        }
    }

    castFreeze(targetBuilding) {
        if (this.type === 4 && this.jellyCount >= 25) {
            this.jellyCount -= 25;
            targetBuilding.status = 'frozen';
        }
    }

    castRedPotion(targetBuilding) {
        const RED_POTION_COST = 40; // Coût arbitraire pour la capture
        if (this.type === 4 && this.jellyCount >= RED_POTION_COST) {
            this.jellyCount -= RED_POTION_COST;
            targetBuilding.ownerId = this.ownerId; // Change le propriétaire
            targetBuilding.status = 'normal'; // Purge les statuts
        }
    }

    // --- AFFICHAGE VISUEL ---

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        // Couleur selon l'ID du joueur
        ctx.fillStyle = players[this.ownerId] ? players[this.ownerId].color : '#bdc3c7';
        
        // Effet visuel si gelé (Opacité réduite)
        if (this.status === 'frozen') ctx.globalAlpha = 0.5;
        
        ctx.fill();
        ctx.globalAlpha = 1.0; // Reset opacité
        
        // Effet visuel si malade (Bordure verte toxique)
        if (this.status === 'sick') {
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#2ecc71';
            ctx.stroke();
        }

        ctx.closePath();

        // Affichage du texte
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Nombre de Jellies
        ctx.font = 'bold 20px Arial';
        ctx.fillText(Math.floor(this.jellyCount), this.x, this.y - 5);
        
        // Type et Niveau
        let typeText = "";
        if (this.type === 1) typeText = `Basic`;
        if (this.type === 2) typeText = `Factory L${this.level}`;
        if (this.type === 3) typeText = `Fort L${this.level}`;
        if (this.type === 4) typeText = `Lab`;
        
        ctx.font = '12px Arial';
        ctx.fillText(typeText, this.x, this.y + 15);
    }
}

// ==========================================
// 3. CRÉATION DES BÂTIMENTS SUR LA CARTE
// ==========================================
const buildings = [
    new Building(150, 300, 50, 1 , 'building', 1 , 10),  // Bâtiment Joueur 1
    new Building(650, 300, 50, 2 , 'building', 1 , 10),  // Bâtiment Ennemi
    new Building(400, 150, 35, 0 , 'building', 1 , 10),  // Bâtiment Neutre Haut
    new Building(400, 450, 35, 0 , 'building', 1 , 10)   // Bâtiment Neutre Bas
];




function gameLoop() {
    // Effacer l'écran
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dessiner tous les bâtiments
    buildings.forEach(building => {
        building.draw(ctx);
    });

    // Boucler à la prochaine frame
    requestAnimationFrame(gameLoop);
}

// Lancement du jeu
requestAnimationFrame(gameLoop);