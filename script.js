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

function formatFileName(text) {
    // Reemplazar "_" por espacio
    text = text.replace(/_/g, ' ');
  
    // Eliminar "-" si hay texto a ambos lados
    text = text.replace(/([^ ])-([^ ])/g, '$1 $2');
  
    // Eliminar ".mid"
    text = text.replace(/\.mid/g, '');
  
    return text;
  }

async function fetchMidiFiles(searchTerm = '', page = 1, pageSize = 50) {
    try {
        const defaultRepo = 'thewildwestmidis/midis';
        const customRepos = JSON.parse(localStorage.getItem('customRepos')) || [];
        let allFiles = [];

        // Cargar archivos de los repositorios custom primero
        for (const repo of customRepos) {
            if (repo !== defaultRepo) {
                const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`);
            const data = await response.json();
            const repoFiles = data.tree.map(item => ({
                ...item,
                name: item.path,
                repo: repo,
                formattedName: formatFileName(item.path) // Guardar el nombre formateado
            }));

            allFiles = allFiles.concat(repoFiles.filter(item => item.name.endsWith('.mid')));
        }
        }

        // Cargar archivos del repositorio original después
        const response = await fetch(`https://api.github.com/repos/${defaultRepo}/git/trees/main?recursive=1`);
        const data = await response.json();
        const defaultFiles = data.tree.map(item => ({
            ...item,
            name: item.path,
            repo: defaultRepo,
            formattedName: formatFileName(item.path) // Guardar el nombre formateado
        }));

        allFiles = allFiles.concat(defaultFiles.filter(item => item.name.endsWith('.mid')));

        // Filtrar por término de búsqueda basado en el nombre formateado
        let filteredFiles = allFiles;
        if (searchTerm) {
            const lowerCaseSearchTerm = searchTerm.toLowerCase();
            filteredFiles = allFiles.filter(file => file.formattedName.toLowerCase().includes(lowerCaseSearchTerm));
        }

        console.log(allFiles)

        // Ordenar archivos para mostrar primero los custom
        filteredFiles.sort((a, b) => {
            if (customRepos.includes(a.repo) && !customRepos.includes(b.repo)) return -1;
            if (!customRepos.includes(a.repo) && customRepos.includes(b.repo)) return 1;
            return 0;
        });

        currentPage = page;
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedFiles = filteredFiles.slice(startIndex, endIndex);

        displayFileList(paginatedFiles);

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
        backButton.setAttribute("href","/favorites")
    }

    setTimeout(() => {
        document.getElementById("bottom").style.display = "block";
    }, 500);
}

function replaceSpaces(inputString) {
    // Use the replace function with a regular expression to replace all spaces with %20
    return inputString.replace(/ /g, '%20');
}

async function displayFileList(files) {
    const customRepos = JSON.parse(localStorage.getItem('customRepos')) || [];
    const isOriginalOnly = customRepos.length === 0;

    // Cargar el objeto de duraciones de MIDIs desde localStorage
    let midiDurations = JSON.parse(localStorage.getItem('midiDurations')) || {};

    fileListContainer.innerHTML = '';

    if (files.length === 0) {
        fileListContainer.innerHTML = '<p>No results found.</p>';
        return;
    }

    for (const file of files) {
        const listItem = document.createElement('li');
        const isFavorite = favoriteFileNames.has(file.name);
        const midiNameUrl = encodeURI(file.name);  // Ensure the file name is URL encoded
        const repoName = file.repo === 'thewildwestmidis/midis' ? 'thewildwestmidis/midis' : file.repo;

        listItem.innerHTML = `
            <div class="divmidiinfo">
                <p class="midiname"><a href="/midi?m=${midiNameUrl}" style="color: inherit; text-decoration: none;">
                    ${file.formattedName}</a></p>
                <p class="duration"></p>
            </div>
            <button class="play-button" data-url="https://raw.githubusercontent.com/${file.repo}/main/${midiNameUrl}">►</button>
            <div class="PlayMusicPos"></div>
            <button class="copy-button" data-url="https://raw.githubusercontent.com/${file.repo}/main/${midiNameUrl}">Copy Midi Data</button>
            <button class="${isFavorite ? 'remove-favorite-button' : 'favorite-button'}" data-file='${JSON.stringify(file)}'>
                ${isFavorite ? 'Unfavorite' : 'Favorite'}
            </button>
        `;

        fileListContainer.appendChild(listItem);

        try {
            const savedDuration = midiDurations[file.name];
            if (!savedDuration) {
                // Cargar la duración del MIDI si no está en el localStorage
                const midi = await Midi.fromUrl(`https://raw.githubusercontent.com/${file.repo}/main/${midiNameUrl}`);
                const durationInSeconds = midi.duration;
                const minutes = Math.floor(durationInSeconds / 60);
                const seconds = Math.round(durationInSeconds % 60);
                const durationText = `${minutes} min, ${seconds < 10 ? '0' : ''}${seconds} sec`;

                // Actualizar el objeto midiDurations
                midiDurations[file.name] = durationText;
                localStorage.setItem('midiDurations', JSON.stringify(midiDurations));

                // Actualizar el texto de la duración en el DOM
                const durationDiv = listItem.querySelector('.duration');
                if (durationDiv) {
                    durationDiv.textContent = `${!isOriginalOnly || repoName !== 'thewildwestmidis/midis' ? repoName + ' - ' : ''}${durationText}`;
                }
            } else {
                // Si la duración ya está en localStorage, actualizar directamente
                const durationDiv = listItem.querySelector('.duration');
                if (durationDiv) {
                    durationDiv.textContent = `${!isOriginalOnly || repoName !== 'thewildwestmidis/midis' ? repoName + ' - ' : ''}${savedDuration}`;
                }
            }
        } catch (error) {
            console.warn('Cannot load duration of midi:', file.name, ' - ', error);
        }
    }


    const copyButtons = document.querySelectorAll('.copy-button');
    copyButtons.forEach(button => {
        button.addEventListener('click', async function () {
            let url = this.getAttribute('data-url');
            let fullUrl = url;

            if (url.includes('thewildwestmidis/midis')) {
                url = url.replace('https://raw.githubusercontent.com/thewildwestmidis/midis/main/','');
                fullUrl = `https://thewildwestmidis.github.io/midis/${encodeURIComponent(url)}`;
            }

            copyToClipboard(fullUrl);

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