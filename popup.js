document.addEventListener("DOMContentLoaded", function () {
    let xpCountElem = document.getElementById("xp-count");
    let xpBar = document.getElementById("xp-bar");
    let addXpBtn = document.getElementById("add-xp");
    let resetXpBtn = document.getElementById("reset-xp");
    let streakCountElem = document.getElementById("streak-count");
    let logStudyBtn = document.getElementById("log-study");
    let dailyChallengeText = document.getElementById("daily-challenge");
    let completeChallengeBtn = document.getElementById("complete-challenge");
    let usernameInput = document.getElementById("username-input");
    let saveUsernameBtn = document.getElementById("save-username");
    let usernameDisplay = document.getElementById("username-display");
    let canvasURLInput = document.getElementById("canvas-url");
    let canvasTokenInput = document.getElementById("canvas-token");
    let syncCanvasXPBtn = document.getElementById("sync-canvas-xp");
    let canvasStatus = document.getElementById("canvas-status");
    
    let currentXp = 0; // Global XP variable
    
    const challenges = [
        "Study for 30 minutes uninterrupted",
        "Summarize your notes in your own words",
        "Test yourself on 10 questions",
        "Explain a concept to a friend"
    ];
    dailyChallengeText.textContent = challenges[Math.floor(Math.random() * challenges.length)];
    
    // Calculate level and progress thresholds based on XP.
    function getLevelAndThreshold(xp) {
        if (xp < 100) return { level: 1, start: 0, end: 100 };
        if (xp < 250) return { level: 2, start: 100, end: 250 };
        if (xp < 500) return { level: 3, start: 250, end: 500 };
        // For XP >= 500, level increases every 250 XP
        let extra = xp - 500;
        let levelIncrement = Math.floor(extra / 250) + 1;
        let level = 3 + levelIncrement;
        let start = 500 + (levelIncrement - 1) * 250;
        let end = start + 250;
        return { level, start, end };
    }
    
    // Update the XP display and progress bar.
    function updateXPUI(xp) {
        let { level, start, end } = getLevelAndThreshold(xp);
        let progress = xp - start;
        let threshold = end - start;
        xpBar.max = threshold;
        xpBar.value = progress;
        xpCountElem.textContent = xp;
        document.getElementById("xp-display").textContent = `XP: ${xp} (Level ${level})`;
    }
    
    // Check the stored streak and reset if more than 24 hours have passed.
    chrome.storage.local.get(["streak", "lastStudyTimestamp"], function(result) {
        let streak = result.streak || 0;
        let lastStudyTimestamp = result.lastStudyTimestamp || 0;
        let now = Date.now();
        if (now - lastStudyTimestamp > 86400000) { // 24 hours in ms
            streak = 0;
            chrome.storage.local.set({"streak": streak});
        }
        streakCountElem.textContent = streak;
    });
    
    // Retrieve initial XP and streak values.
    chrome.storage.local.get(["xp", "streak"], function (result) {
        currentXp = result.xp || 0;
        updateXPUI(currentXp);
        streakCountElem.textContent = result.streak || 0;
    });
    
    // Manual XP buttons.
    addXpBtn.addEventListener("click", function () {
        chrome.storage.local.get(["xp", "username"], function(result) {
            let newXp = (result.xp || 0) + 50;
            chrome.storage.local.set({"xp": newXp}, function () {
                currentXp = newXp;
                updateXPUI(newXp);
                if(result.username) {
                    updateLeaderboard(result.username, newXp);
                }
            });
        });
    });
    
    resetXpBtn.addEventListener("click", function () {
        chrome.storage.local.get("username", function(result) {
            chrome.storage.local.set({"xp": 0}, function () {
                currentXp = 0;
                updateXPUI(0);
                if(result.username) {
                    updateLeaderboard(result.username, 0);
                }
            });
        });
    });
    
    // Log a study day and update streak.
    logStudyBtn.addEventListener("click", function () {
        chrome.storage.local.get(["streak", "lastStudyTimestamp"], function(result) {
            let now = Date.now();
            let streak = result.streak || 0;
            // Increment streak (for MVP, multiple logs add up)
            streak = streak + 1;
            chrome.storage.local.set({"streak": streak, "lastStudyTimestamp": now}, function () {
                streakCountElem.textContent = streak;
            });
        });
    });
    
    completeChallengeBtn.addEventListener("click", function () {
        addXpBtn.click();
    });
    
    // Handle username saving.
    chrome.storage.local.get("username", function(result) {
        if(result.username) {
            usernameDisplay.textContent = "Hello, " + result.username;
            usernameInput.style.display = "none";
            saveUsernameBtn.style.display = "none";
        }
    });
    
    saveUsernameBtn.addEventListener("click", function() {
        let username = usernameInput.value.trim();
        if(username) {
            chrome.storage.local.set({"username": username}, function() {
                usernameDisplay.textContent = "Hello, " + username;
                usernameInput.style.display = "none";
                saveUsernameBtn.style.display = "none";
                updateLeaderboard(username, currentXp);
            });
        }
    });
    
    // Leaderboard functions.
    function updateLeaderboard(username, xp) {
        chrome.storage.local.get("leaderboard", function(result) {
            let leaderboard = result.leaderboard || [];
            let index = leaderboard.findIndex(entry => entry.username === username);
            if(index >= 0) {
                if(xp > leaderboard[index].xp) {
                    leaderboard[index].xp = xp;
                }
            } else {
                leaderboard.push({username: username, xp: xp});
            }
            chrome.storage.local.set({"leaderboard": leaderboard}, function() {
                displayLeaderboard();
            });
        });
    }
    
    function displayLeaderboard() {
        chrome.storage.local.get("leaderboard", function(result) {
            let leaderboard = result.leaderboard || [];
            leaderboard.sort((a, b) => b.xp - a.xp);
            let leaderboardList = document.getElementById("leaderboard-list");
            leaderboardList.innerHTML = "";
            leaderboard.forEach(entry => {
                let li = document.createElement("li");
                li.textContent = `${entry.username}: ${entry.xp} XP`;
                leaderboardList.appendChild(li);
            });
        });
    }
    
    // Show the leaderboard on load.
    displayLeaderboard();
    
    // -------------------------
    // Canvas Integration: Sync XP based on completed assignments.
    // -------------------------
    function syncCanvasXP() {
        canvasStatus.textContent = "Syncing...";
        let canvasURL = canvasURLInput.value.trim();
        let canvasToken = canvasTokenInput.value.trim();
        if (!canvasURL || !canvasToken) {
            canvasStatus.textContent = "Please enter both Canvas URL and API token.";
            return;
        }
        // Get the list of assignments already processed.
        chrome.storage.local.get(["processedAssignments"], function(result) {
            let processedAssignments = result.processedAssignments || [];
            // Fetch courses the user is enrolled in.
            fetch(`${canvasURL}/api/v1/courses`, {
                headers: {
                    "Authorization": "Bearer " + canvasToken
                }
            })
            .then(response => {
                if (!response.ok) throw new Error("Failed to fetch courses");
                return response.json();
            })
            .then(courses => {
                let promises = [];
                courses.forEach(course => {
                    let courseId = course.id;
                    // Fetch assignments for the course, including submission details.
                    let assignmentURL = `${canvasURL}/api/v1/courses/${courseId}/assignments?include[]=submission`;
                    promises.push(
                        fetch(assignmentURL, {
                            headers: {
                                "Authorization": "Bearer " + canvasToken
                            }
                        })
                        .then(response => {
                            if (!response.ok) throw new Error("Failed to fetch assignments for course " + courseId);
                            return response.json();
                        })
                        .then(assignments => {
                            assignments.forEach(assignment => {
                                // Check if the assignment has a submission marked as "submitted" or "graded"
                                if (assignment.submission && 
                                    (assignment.submission.workflow_state === "submitted" || assignment.submission.workflow_state === "graded")) {
                                    if (!processedAssignments.includes(assignment.id)) {
                                        // Award XP for this assignment.
                                        currentXp += 50;
                                        processedAssignments.push(assignment.id);
                                    }
                                }
                            });
                        })
                    );
                });
                return Promise.all(promises).then(() => processedAssignments);
            })
            .then(updatedProcessedAssignments => {
                // Save the updated processed assignments and XP.
                chrome.storage.local.set({"processedAssignments": updatedProcessedAssignments, "xp": currentXp}, function() {
                    updateXPUI(currentXp);
                    canvasStatus.textContent = "Sync complete. XP updated.";
                    chrome.storage.local.get("username", function(result) {
                        if (result.username) {
                            updateLeaderboard(result.username, currentXp);
                        }
                    });
                });
            })
            .catch(err => {
                console.error(err);
                canvasStatus.textContent = "Error during sync. Check your Canvas URL/API token.";
            });
        });
    }
    
    // Attach event listener to the Sync Canvas XP button.
    syncCanvasXPBtn.addEventListener("click", syncCanvasXP);
});
