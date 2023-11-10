const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const fileListContainer = document.getElementById('file-list');
const urlParams = new URLSearchParams(window.location.search);

// favorites.js

const favoritesList = document.getElementById('favorites-list');
const favorites = JSON.parse(localStorage.getItem('favorites')) || [];

// Create a map of favorite file names for faster lookup
const favoriteFileNames = new Set(favorites.map(file => file.name));


// Obtener el término de búsqueda de los parámetros de la URL
const searchTermFromURL = urlParams.get('search');
if (searchTermFromURL) {
    searchInput.value = searchTermFromURL;
}

function createElementFromHTML(htmlString) {
    var div = document.createElement('div');
    div.innerHTML = htmlString.trim();
  
    // Change this to div.childNodes to support multiple top-level nodes.
    return div.firstChild;
}

searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const searchTerm = searchInput.value.toLowerCase();
    
     fetchMidiFiles(searchTerm);

     // Actualizar la URL con el parámetro de búsqueda
    urlParams.set('search', searchTerm);
    history.pushState(null, '', `?search=${encodeURIComponent(searchTerm)}`);
});

async function fetchMidiFiles(searchTerm = '') {
    try {
        const response = await fetch('https://api.github.com/repos/Bertogim/The-Wild-West-Midis/contents/midis');
        const data = await response.json();

        const midiFiles = data.filter(item => item.name.endsWith('.mid'));

        // Filtrar por término de búsqueda si se proporciona
        if (searchTerm) {
            const filteredFiles = midiFiles.filter(file => file.name.toLowerCase().includes(searchTerm));
            displayFileList(filteredFiles);
        } else {
            displayFileList(midiFiles);
        }
    } catch (error) {
        console.warn('Failed to load duration of midi:', file.name, ' - ', error);
    }
}

function formatFileName(name) {
    // Reemplazar "_" y "-" por " " (espacio)
    const formattedName = name.replace(/_/g, ' ').replace(/-/g, ' ');

    // Eliminar espacios duplicados causados por el reemplazo anterior
    return formattedName.replace(/\s+/g, ' ');
}

function displayFileList(files) {
    fileListContainer.innerHTML = '';

    if (files.length === 0) {
        fileListContainer.innerHTML = '<p>No results found.</p>';
        return;
    }
    
    const durationPromises = files.map(async file => {
        if (favoriteFileNames.has(file.name)) {
        const listItem = document.createElement('li');
        const isFavorite = favoriteFileNames.has(file.name);
    
        listItem.innerHTML = `
            <div class="divmidiinfo">
                <p class="midiname">${formatFileName(file.name)}</p>
                <p class="duration"></p>
            </div>
            <button class="copy-button" data-url="${file.download_url}">Copy Midi Data</button>
            <button class="${isFavorite ? 'remove-favorite-button' : 'favorite-button'}" data-file='${JSON.stringify(file)}'>
                ${isFavorite ? 'Unfavorite' : 'Favorite'}
                </button>
                <button class="play-button" data-url="${file.download_url}">Play</button>
                <button class="stop-button" style="display: none">Stop</button>
            `;

        fileListContainer.appendChild(listItem);
        

        // Cargar y mostrar la duración
        try {
            const savedDuration = localStorage.getItem(`midi_duration_${file.name}`);
            if (savedDuration) {
                const durationDiv = listItem.querySelector('.duration');
                if (durationDiv) {
                    durationDiv.textContent = savedDuration;
                }
            } else {
                const midi = await Midi.fromUrl(file.download_url);
                const durationInSeconds = midi.duration;
                const minutes = Math.floor(durationInSeconds / 60);
                const seconds = Math.round(durationInSeconds % 60);
                const durationText = `${minutes} min, ${seconds < 10 ? '0' : ''}${seconds} sec`;
                const durationDiv = listItem.querySelector('.duration');
                if (durationDiv) {
                    durationDiv.textContent = durationText;
                }

                // Guardar la duración en el almacenamiento local
                localStorage.setItem(`midi_duration_${file.name}`, durationText);
            }
        } catch (error) {
            console.error('Error loading duration of midi:', file.name, ' - ', error);
        }

    }});
    

    const copyButtons = document.querySelectorAll('.copy-button');
    copyButtons.forEach(button => {
        button.addEventListener('click', async function () {
            const url = this.getAttribute('data-url');
            copyToClipboard(url);

            button.textContent = 'Copied!';
            await new Promise(resolve => setTimeout(() => {
                button.textContent = 'Copy Midi Data';
            }, 1000));
        });
    });
    
    const playButtons = document.querySelectorAll('.play-button');
    const stopButtons = document.querySelectorAll('.stop-button');

    playButtons.forEach((playButton, index) => {
        playButton.addEventListener('click', async function () {
            const url = this.getAttribute('data-url');
            const midiplayer = createElementFromHTML('<midi-player sound-font visualizer="#myVisualizer"></midi-player>');
            midiplayer.setAttribute("src",url);
            midiplayer.style.display = 'none';
            //midiplayer.setAttribute("sound-font visualizer","#section3 midi-visualizer");
            playButton.parentElement.appendChild(midiplayer);
            playButton.textContent = "Loading"
            playButton.classList.add('play-button-loading');
            
            midiplayer.addEventListener('load', () => {
                midiplayer.start();
                playButton.textContent = "Play"
                playButton.classList.remove('play-button-loading');
                stopButtons.forEach(stopButton => {
                    stopButton.style.display = 'none';
                });
                // Ocultar el botón "Play" actual
                playButton.style.display = 'none';
    
                // Mostrar el botón "Stop" correspondiente
                stopButtons[index].style.display = 'block';
                // Mostrar el botón "Play" en los otros elementos
                playButtons.forEach((button, idx) => {
                    if (idx !== index) {
                        button.style.display = 'block';
                    }
                });

                // Parar el midi

                const stopButton = playButton.parentElement.querySelector('.stop-button');

                stopButton.addEventListener('click', () => {
                    midiplayer.stop();
                    midiplayer.remove();
                    // Mostrar el botón "Play" en los otros elementos
                    playButtons.forEach((button, idx) => {
                        button.style.display = 'block';
                    });
                    // Esconder el botón "Stop" correspondiente
                    stopButtons[index].style.display = 'none';
        
                });
            });
            });


        });
    

    const favoriteButtons = document.querySelectorAll('.favorite-button');
    favoriteButtons.forEach(button => {
        button.addEventListener('click', function () {
            const fileData = JSON.parse(this.getAttribute('data-file'));
            const favorites = JSON.parse(localStorage.getItem('favorites')) || [];

            const existingIndex = favorites.findIndex(favorite => favorite.name === fileData.name);
            if (existingIndex !== -1) {
                favorites.splice(existingIndex, 1);
                this.textContent = 'Favorite';
                this.classList.remove('remove-favorite-button');
                this.classList.add('favorite-button');
            } else {
                favorites.push(fileData);
                this.textContent = 'Unfavorite';
                this.classList.remove('favorite-button');
                this.classList.add('remove-favorite-button');
            }
    
            localStorage.setItem('favorites', JSON.stringify(favorites));
        });
    });

    const favoriteDelButtons = document.querySelectorAll('.remove-favorite-button');
    favoriteDelButtons.forEach(button => {
        button.addEventListener('click', function () {
            const fileData = JSON.parse(this.getAttribute('data-file'));
            const favorites = JSON.parse(localStorage.getItem('favorites')) || [];

            const existingIndex = favorites.findIndex(favorite => favorite.name === fileData.name);
            if (existingIndex !== -1) {
                favorites.splice(existingIndex, 1);
                this.textContent = 'Favorite';
                this.classList.remove('remove-favorite-button');
                this.classList.add('favorite-button');
            } else {
                favorites.push(fileData);
                this.textContent = 'Unfavorite';
                this.classList.remove('favorite-button');
                this.classList.add('remove-favorite-button');
            }
    
            localStorage.setItem('favorites', JSON.stringify(favorites));
        });
    });
}

function copyToClipboard(text) {
    const tempInput = document.createElement('input');
    document.body.appendChild(tempInput);
    tempInput.value = text;
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
}

// Llamar a la función para obtener y mostrar la lista de archivos MIDI
const searchTerm = urlParams.get('search');
setTimeout(() => {
    fetchMidiFiles(searchTerm);
}, 100);