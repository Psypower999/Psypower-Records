console.log('Lets write JavaScript');
let currentSong = new Audio();
let songs;
let currFolder;

// Global album index for search
let albumToSongs = {}; // { [albumName: string]: string[] }
let albumLoadInFlight = {}; // { [albumName: string]: Promise<string[]> }

// Add event listeners to the audio element for debugging
currentSong.addEventListener('loadstart', () => console.log('Audio: loadstart'));
currentSong.addEventListener('loadeddata', () => console.log('Audio: loadeddata'));
currentSong.addEventListener('canplay', () => console.log('Audio: canplay'));
currentSong.addEventListener('play', () => console.log('Audio: play event'));
currentSong.addEventListener('pause', () => console.log('Audio: pause event'));
currentSong.addEventListener('error', (e) => console.error('Audio error:', e));

// Test function removed - we'll use real songs now

// No hardcoded database - we'll fetch real songs from the server

// Function to clean song names by removing track numbers and file extensions
function cleanSongName(filename) {
    // Remove .mp3 extension
    let cleanName = filename.replace('.mp3', '');
    
    // Remove track numbers (patterns like "01 - ", "1. ", "01.", etc.)
    cleanName = cleanName.replace(/^\d+\.?\s*-?\s*/, '');
    
    // Decode URL encoding (%20 becomes space, etc.)
    cleanName = decodeURIComponent(cleanName);
    
    // Remove any remaining leading/trailing spaces
    cleanName = cleanName.trim();
    
    return cleanName;
}

function secondsToMinutesSeconds(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return "00:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');

    return `${formattedMinutes}:${formattedSeconds}`;
}

// Load songs for an album into the global cache without changing UI
async function loadAlbumSongs(albumName) {
    if (albumToSongs[albumName]) return albumToSongs[albumName];
    if (albumLoadInFlight[albumName]) return albumLoadInFlight[albumName];

    const folderPath = `/Website/songs/${albumName}`;
    const p = (async () => {
        try {
            const res = await fetch(`${folderPath}/`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            const div = document.createElement('div');
            div.innerHTML = html;
            const links = div.getElementsByTagName('a');
            const list = [];
            for (let i = 0; i < links.length; i++) {
                const href = links[i].href;
                if (href.endsWith('.mp3')) list.push(href.split('/').pop());
            }
            albumToSongs[albumName] = list;
            return list;
        } catch (e) {
            console.error('Failed loading album songs for', albumName, e);
            albumToSongs[albumName] = [];
            return [];
        } finally {
            delete albumLoadInFlight[albumName];
        }
    })();

    albumLoadInFlight[albumName] = p;
    return p;
}

// Render global search results (songs across all albums) into the sidebar
async function renderSongSearchResults(query) {
    const q = query.trim().toLowerCase();
    const ul = document.querySelector('.songList ul');
    if (!ul) return;
    ul.innerHTML = '';
    if (q === '') return;

    // Gather album names from cards
    const albumCards = Array.from(document.querySelectorAll('.card[data-folder]'));
    const albumNames = albumCards.map(c => c.getAttribute('data-folder')).filter(Boolean);

    // Ensure all albums are loaded (in parallel)
    await Promise.all(albumNames.map(name => loadAlbumSongs(name)));

    // Collect matching songs
    const results = [];
    for (const albumName of albumNames) {
        const list = albumToSongs[albumName] || [];
        for (const filename of list) {
            const name = cleanSongName(filename).toLowerCase();
            if (name.includes(q)) {
                results.push({ albumName, filename, cleanName: cleanSongName(filename) });
            }
        }
    }

    // Render results
    if (results.length === 0) {
        ul.innerHTML = `<li style="text-align: center; padding: 20px; color: #666;">No matching songs</li>`;
        return;
    }

    const fragments = [];
    for (const r of results) {
        const cover = `/Website/songs/${r.albumName}/cover.jpg`;
        fragments.push(
            `<li data-album="${r.albumName}" data-track="${encodeURIComponent(r.filename)}">
                <img width="40" height="40" src="${cover}" alt="Album cover" style="border-radius:4px;object-fit:cover;">
                <div class="info">
                    <div>${r.cleanName}</div>
                    <div>Psypower</div>
                </div>
            </li>`
        );
    }
    ul.innerHTML = fragments.join('');

    // Attach click listeners to play the selected global result
    Array.from(ul.querySelectorAll('li[data-album][data-track]')).forEach(li => {
        li.addEventListener('click', () => {
            const albumName = li.getAttribute('data-album');
            const track = decodeURIComponent(li.getAttribute('data-track'));
            // Set context to the album of the clicked song
            currFolder = `/Website/songs/${albumName}`;
            songs = albumToSongs[albumName] ? [...albumToSongs[albumName]] : [];
            // Highlight the corresponding album card
            document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
            const card = document.querySelector(`.card[data-folder="${CSS.escape(albumName)}"]`);
            if (card) card.classList.add('selected');
            // Play the song
            playMusic(track);
            // Ensure sidebar visible
            document.querySelector('.left').style.left = '0';
        });
    });
}

// Live search helpers
function filterAlbums(query) {
    const q = query.trim().toLowerCase();
    const cards = document.querySelectorAll('.card[data-folder]');
    cards.forEach(card => {
        const folder = (card.getAttribute('data-folder') || '').toLowerCase();
        const title = (card.querySelector('h2')?.textContent || '').toLowerCase();
        const matches = q === '' || folder.includes(q) || title.includes(q);
        card.style.display = matches ? '' : 'none';
    });
}

function filterSongs(query) {
    const q = query.trim().toLowerCase();
    const lis = document.querySelectorAll('.songList ul li');
    lis.forEach(li => {
        const nameEl = li.querySelector('.info div');
        const songName = (nameEl?.textContent || '').toLowerCase();
        const matches = q === '' || songName.includes(q);
        li.style.display = matches ? '' : 'none';
    });
}

async function getSongs(albumName) {
    console.log('Getting songs for album:', albumName);
    
    currFolder = `/Website/songs/${albumName}`;
    
    try {
        console.log('Fetching songs from server:', `${currFolder}/`);
        let response = await fetch(`${currFolder}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        let html = await response.text();
        console.log('Server response received, length:', html.length);
        
        let div = document.createElement("div");
        div.innerHTML = html;
        let links = div.getElementsByTagName("a");
        
        songs = [];
        console.log('Found', links.length, 'links in directory');
        
        for (let i = 0; i < links.length; i++) {
            let href = links[i].href;
            console.log('Checking link:', href);
            
            if (href.endsWith(".mp3")) {
                // Extract just the filename from the full URL
                let songName = href.split('/').pop();
                songs.push(songName);
                console.log('Added song:', songName);
            }
        }
        
        console.log('Total songs found:', songs.length);
        console.log('Songs list:', songs);
        
    } catch (error) {
        console.error('Error fetching songs from server:', error);
        songs = [];
    }
 


    // Show all the songs in the playlist
    let songUL = document.querySelector(".songList").getElementsByTagName("ul")[0]
    songUL.innerHTML = ""
    
    if (songs.length > 0) {
        for (const song of songs) {
            const cleanName = cleanSongName(song);
            songUL.innerHTML = songUL.innerHTML + `<li><img width="40" height="40" src="${currFolder}/cover.jpg" alt="Album cover" style="border-radius:4px;object-fit:cover;">
                                <div class="info">
                                    <div>${cleanName}</div>
                                    <div>Psypower</div>
                                </div>
                                </li>`;
        }

        // Attach an event listener to each song
        Array.from(document.querySelector(".songList").getElementsByTagName("li")).forEach(e => {
            e.addEventListener("click", element => {
                playMusic(e.querySelector(".info").firstElementChild.innerHTML.trim())
            })
        })
    } else {
        songUL.innerHTML = `<li style="text-align: center; padding: 20px; color: #666;">No songs found in this album</li>`;
    }

    // Apply current search filter to songs as well (if user typed already)
    const searchInput = document.querySelector('.searchbar input');
    if (searchInput) {
        filterSongs(searchInput.value || '');
    }

    return songs
}

const playMusic = (track, pause = false) => {
    // Find the original filename from the songs array
    const originalFilename = songs.find(song => cleanSongName(song) === track);
    const filenameToPlay = originalFilename || track;
    
    // Get the clean song name for display
    const cleanDisplayName = originalFilename ? cleanSongName(originalFilename) : cleanSongName(track);
    
    currentSong.src = `${currFolder}/` + filenameToPlay
    console.log('Playing music from:', currentSong.src);
    console.log('Current folder:', currFolder);
    console.log('Track:', track);
    console.log('Original filename:', filenameToPlay);
    console.log('Clean display name:', cleanDisplayName);
    
    if (!pause) {
        currentSong.play()
            .then(() => {
                console.log('Audio started playing successfully');
                play.src = "/Website/img/pause.svg"
            })
            .catch(error => {
                console.error('Error playing audio:', error);
                console.log('Audio source:', currentSong.src);
            });
    }
    document.querySelector(".songinfo").innerHTML = cleanDisplayName
    document.querySelector(".songtime").innerHTML = "00:00 / 00:00"
}

async function displayAlbums() {
    console.log("displaying albums")
    let a = await fetch(`/songs/`)
    let response = await a.text();
    let div = document.createElement("div")
    div.innerHTML = response;
    let anchors = div.getElementsByTagName("a")
    let cardContainer = document.querySelector(".cardContainer")
    let array = Array.from(anchors)
    for (let index = 0; index < array.length; index++) {
        const e = array[index]; 
        if (e.href.includes("/songs") && !e.href.includes(".htaccess")) {
            let folder = e.href.split("/").slice(-2)[0]
            // Get the metadata of the folder
            let a = await fetch(`/Website//songs/${folder}/info.json`)
            let response = await a.json(); 
            cardContainer.innerHTML = cardContainer.innerHTML + ` <div data-folder="${folder}" class="card">
            <div class="play">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 20V4L19 12L5 20Z" stroke="#141B34" fill="#000" stroke-width="1.5"
                        stroke-linejoin="round" />
                </svg>
            </div>

            <img src="/Website//songs/${folder}/cover.jpg" alt="">
            <h2>${response.title}</h2>
            <p>${response.description}</p>
        </div>`
        }
    }

    // No click handler here; handled in main()
}

async function main() {
    // Initialize with first album's songs (optional - can be removed if not needed)
    // await getSongs("/Website/songs/Broken Atmosphere")
    // playMusic(songs[0], true)

    // Helper: auto-hide sidebar on small screens
    function adjustSidebarForViewport() {
        const leftEl = document.querySelector('.left');
        if (!leftEl) return;
        if (window.innerWidth <= 1024) {
            // Hide off-canvas on small screens
            leftEl.style.left = "-120%";
        } else {
            // Show normally on larger screens
            leftEl.style.left = ""; // reset to stylesheet default
        }
    }

    // Run once and on resize
    adjustSidebarForViewport();
    window.addEventListener('resize', adjustSidebarForViewport);

    // Add click listeners to all album cards (static and dynamic)
    document.querySelectorAll('.card[data-folder]').forEach(card => {
        card.addEventListener('click', async () => {
            console.log('Album card clicked!');
            
            // Remove selected class from all cards
            document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
            
            // Add selected class to clicked card
            card.classList.add('selected');
            
            const albumName = card.getAttribute('data-folder');
            console.log('Album name:', albumName);
            
            try {
                await getSongs(albumName);
                console.log('Songs loaded:', songs);
                
                if (songs && songs.length > 0) {
                    console.log('Playing first song:', songs[0]);
                    playMusic(songs[0]);
                    // Show the left sidebar with the song list
                    document.querySelector('.left').style.left = '0';
                } else {
                    console.log('No songs found in this album');
                }
            } catch (error) {
                console.error('Error loading songs:', error);
            }
        });
    });

    // Wire up left menu: Home and Search
    const leftLis = Array.from(document.querySelectorAll('#lefthomecontainer .home ul li'));
    const homeBtn = leftLis.find(li => (li.textContent || '').trim().toLowerCase().includes('home'));
    const searchBtn = leftLis.find(li => (li.textContent || '').trim().toLowerCase().includes('search'));

    if (homeBtn) {
        homeBtn.style.cursor = 'pointer';
        homeBtn.addEventListener('click', async () => {
            const input = document.querySelector('.searchbar input');
            if (input) {
                input.value = '';
            }
            // Show all albums
            filterAlbums('');
            // Restore current album songs if we have context
            if (currFolder) {
                const parts = currFolder.split('/').filter(Boolean);
                const albumName = decodeURIComponent(parts[parts.length - 1] || '');
                if (albumName) {
                    await getSongs(albumName);
                }
            }
            // Ensure sidebar visible
            const left = document.querySelector('.left');
            if (left) left.style.left = '0';
        });
    }

    if (searchBtn) {
        searchBtn.style.cursor = 'pointer';
        searchBtn.addEventListener('click', () => {
            const input = document.querySelector('.searchbar input');
            if (input) {
                input.focus();
                input.select();
            }
        });
    }

    // Live search input listener
    const searchInput = document.querySelector('.searchbar input');
    if (searchInput) {
        searchInput.addEventListener('input', async (e) => {
            const q = e.target.value || '';
            filterAlbums(q);
            if (q.trim() === '') {
                // If cleared, restore current album song list filter (hide none)
                filterSongs('');
                // Also restore current album songs if available
                if (currFolder) {
                    const parts = currFolder.split('/').filter(Boolean);
                    const albumName = decodeURIComponent(parts[parts.length - 1] || '');
                    if (albumName) {
                        await getSongs(albumName);
                    }
                }
            } else {
                // Render global song results across albums
                await renderSongSearchResults(q);
            }
        });
    }


    // Attach an event listener to play, next and previous
    play.addEventListener("click", () => {
        if (currentSong.paused) {
            currentSong.play()
            play.src = "/Website/img/pause.svg"
        }
        else {
            currentSong.pause()
            play.src = "/Website/img/play.svg"
        }
    })

    // Listen for timeupdate event
    currentSong.addEventListener("timeupdate", () => {
        document.querySelector(".songtime").innerHTML = `${secondsToMinutesSeconds(currentSong.currentTime)} / ${secondsToMinutesSeconds(currentSong.duration)}`
        if (!window.__isSeeking) {
            document.querySelector(".circle").style.left = (currentSong.currentTime / currentSong.duration) * 100 + "%";
        }
    })

    // Precise draggable seekbar with live scrubbing
    const seekbar = document.querySelector(".seekbar");
    const circle = document.querySelector(".circle");

    function setTimeFromClientX(clientX) {
        const rect = seekbar.getBoundingClientRect();
        let percent = (clientX - rect.left) / rect.width;
        if (percent < 0) percent = 0;
        if (percent > 1) percent = 1;
        circle.style.left = (percent * 100) + "%";
        if (!isNaN(currentSong.duration)) {
            currentSong.currentTime = currentSong.duration * percent;
        }
    }

    seekbar.addEventListener('pointerdown', (e) => {
        window.__isSeeking = true;
        seekbar.setPointerCapture(e.pointerId);
        setTimeFromClientX(e.clientX);
    });

    seekbar.addEventListener('pointermove', (e) => {
        if (window.__isSeeking) {
            setTimeFromClientX(e.clientX);
        }
    });

    const endSeek = (e) => {
        if (window.__isSeeking) {
            window.__isSeeking = false;
            if (e && e.pointerId) {
                try { seekbar.releasePointerCapture(e.pointerId); } catch (_) {}
            }
        }
    };
    seekbar.addEventListener('pointerup', endSeek);
    seekbar.addEventListener('pointercancel', endSeek);
    seekbar.addEventListener('pointerleave', (e) => { if (window.__isSeeking) setTimeFromClientX(e.clientX); });

    // Configure and improve volume slider responsiveness
    const volumeInput = document.querySelector(".range").getElementsByTagName("input")[0];
    if (volumeInput) {
        volumeInput.min = "0";
        volumeInput.max = "100";
        volumeInput.step = "1";
        volumeInput.value = String(Math.round((currentSong.volume || 0.1) * 100));

        const applyVolumeIcon = (vol) => {
            const volImg = document.querySelector(".volume>img");
            if (!volImg) return;
            if (vol <= 0) {
                volImg.src = volImg.src.replace("volume.svg", "mute.svg");
            } else {
                volImg.src = volImg.src.replace("mute.svg", "volume.svg");
            }
        };

        const onVolumeInput = (e) => {
            const val = parseInt(e.target.value);
            const vol = isNaN(val) ? 0 : (val / 100);
            currentSong.volume = vol;
            applyVolumeIcon(vol);
        };

        volumeInput.addEventListener("input", onVolumeInput);
        volumeInput.addEventListener("change", onVolumeInput);

        // Initialize icon
        applyVolumeIcon(currentSong.volume || 0.1);
    }

    // Add event listener to mute the track (toggle)
    document.querySelector(".volume>img").addEventListener("click", e=>{ 
        const volImg = e.target;
        if(volImg.src.includes("volume.svg")){
            volImg.src = volImg.src.replace("volume.svg", "mute.svg")
            currentSong.volume = 0;
            if (volumeInput) volumeInput.value = 0;
        }
        else{
            volImg.src = volImg.src.replace("mute.svg", "volume.svg")
            currentSong.volume = .10;
            if (volumeInput) volumeInput.value = 10;
        }

    })





}

main() 