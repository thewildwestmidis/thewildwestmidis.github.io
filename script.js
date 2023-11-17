const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const fileListContainer = document.getElementById('file-list');
const urlParams = new URLSearchParams(window.location.search);
document.getElementById("BackButton").style.display = "none";

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

// Definir favoriteFileNames aquí para que esté disponible en todo el archivo script.js
const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
const favoriteFileNames = new Set(favorites.map(file => file.name));

searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const searchTerm = searchInput.value.toLowerCase();
    fetchMidiFiles(searchTerm);
    // Actualizar la URL con el parámetro de búsqueda
    urlParams.set('search', searchTerm);
    history.pushState(null, '', `?search=${encodeURIComponent(searchTerm)}`);
});

let allMidiFiles = [];
const pageSize = 50; // Número de MIDIs por página
let currentPage = 1;

async function fetchMidiFiles(searchTerm = '', page = 1, pageSize = 50) {
    try {
        const response = await fetch('https://api.github.com/repos/thewildwestmidis/midis/contents/');
        const data = await response.json();

        const midiFiles = data.filter(item => item.name.endsWith('.mid'));
        const favoriteFileNames = new Set(favorites.map(file => file.name));

        // Filtrar por término de búsqueda si se proporciona
        let filteredFiles = midiFiles;
        if (searchTerm) {
            filteredFiles = midiFiles.filter(file => file.name.toLowerCase().includes(searchTerm));
        }

        // Actualizar currentPage y pageSize globalmente
        currentPage = page;

        // Calcular límites de la página
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedFiles = filteredFiles.slice(startIndex, endIndex);

        displayFileList(paginatedFiles);

        // Generar la paginación
        const totalPages = Math.ceil(filteredFiles.length / pageSize);
        generatePagination(totalPages, currentPage, searchTerm);
    } catch (error) {
        console.error('Error fetching MIDI files:', error);
    }
}

function generatePagination(totalPages, currentPage, searchTerm) {
    const paginationContainer = document.getElementById('pagination');
    paginationContainer.innerHTML = '';

    for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.addEventListener('click', () => {
            fetchMidiFiles(searchTerm, i);
            window.scrollTo(0, 0);
        });

        if (i === currentPage) {
            pageButton.classList.add('active');
        }

        paginationContainer.appendChild(pageButton);
    }

    if (searchTerm) {
        // Agregar botón de retroceso para búsquedas
        const backButton = document.getElementById("BackButton")
        backButton.style.display = "inline"
        backButton.addEventListener('click', () => {
            const searchInput = document.getElementById('search-input');
            searchInput.value = '';
            window.location.href = "/";
            fetchMidiFiles('', 1);
            backButton.style.display = "none"
        });
    }
}

function formatFileName(name) {
    // Reemplazar "_" y "-" por " " (espacio)
    const formattedName = name.replace(/_/g, ' ').replace(/-/g, ' ');

    // Eliminar espacios duplicados causados por el reemplazo anterior
    return formattedName.replace(/\s+/g, ' ');
}

async function displayFileList(files) {
    fileListContainer.innerHTML = '';

    if (files.length === 0) {
        fileListContainer.innerHTML = '<p>No results found.</p>';
        return;
    }

    const durationPromises = files.map(async file => {
        const listItem = document.createElement('li');
        const isFavorite = favoriteFileNames.has(file.name);

        listItem.innerHTML = `
            <div class="divmidiinfo">
                <p class="midiname"><a href="/midi?m=${file.name}" style="color: inherit; text-decoration: none;">${formatFileName(file.name)}</a></p>
                <p class="duration"></p>
            </div>
            <button class="play-button" data-url="${file.download_url}">►</button>
            <div class="PlayMusicPos"></div>
            <button class="copy-button" data-url="${file.download_url}">Copy Midi Data</button>
            <button class="${isFavorite ? 'remove-favorite-button' : 'favorite-button'}" data-file='${JSON.stringify(file)}'>
                ${isFavorite ? 'Unfavorite' : 'Favorite'}
            </button>
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
            console.warn('Cant load duration of midi:', file.name, ' - ', error);
        }
    });

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

    playButtons.forEach((playButton, index) => {
        playButton.addEventListener('click', async function () {
            const url = this.getAttribute('data-url');
            const midiplayer = createElementFromHTML('<midi-player class="Midi-player" sound-font visualizer="#myVisualizer"></midi-player>');
            midiplayer.setAttribute("src",url);
            playButton.parentElement.getElementsByClassName("PlayMusicPos")[0].appendChild(midiplayer);
            playButton.remove()

            midiplayer.addEventListener('load', () => {
                midiplayer.start();
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