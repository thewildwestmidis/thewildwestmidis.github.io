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

        const cacheDefaultDuration = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
        const cacheCustomDuration = 1000; //* 60;

        // Función para obtener archivos de un repositorio con caché
        async function fetchRepoFiles(repo, isDefault = false) {
            const cacheKey = `repoFiles_${repo}`;
            const cachedData = localStorage.getItem(cacheKey);

            // Verificar si hay datos en caché y si aún son válidos
            if (cachedData) {
                const cached = JSON.parse(cachedData);
                const currentTime = new Date().getTime();

                // Usar el tiempo de caché adecuado según si el repositorio es predeterminado o no
                const cacheDuration = isDefault ? cacheDefaultDuration : cacheCustomDuration;

                if (currentTime - cached.timestamp < cacheDuration) {
                    console.log(`Using cache for ${repo}`);
                    return cached.files;
                }
                console.log(`Cache for ${repo} expired`);
            }

            // Si no hay caché o está expirado, hacer la solicitud a la API
            try {
                console.log(`Using request for ${repo}`);

                const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`);
                const data = await response.json();
                const repoFiles = data.tree.map(item => ({
                    ...item,
                    name: item.path,
                    repo: repo,
                    formattedName: formatFileName(item.path) // Guardar el nombre formateado
                }));

                // Filtrar archivos MIDI
                const midiFiles = repoFiles.filter(item => item.name.endsWith('.mid'));

                // Guardar los archivos en caché
                localStorage.setItem(cacheKey, JSON.stringify({
                    timestamp: new Date().getTime(),
                    files: midiFiles
                }));

                return midiFiles;
            } catch (error) {
                console.error(`Error fetching files from ${repo}:`, error);

                // En caso de error, intentar usar los archivos almacenados previamente (si hay)
                if (cachedData) {
                    const cached = JSON.parse(cachedData);
                    return cached.files;
                }

                // Si no hay caché, retornar un array vacío
                return [];
            }
        }

        // Cargar archivos de los repositorios custom primero
        for (const repo of customRepos) {
            if (repo !== defaultRepo) {
                const repoFiles = await fetchRepoFiles(repo);
                allFiles = allFiles.concat(repoFiles);
            }
        }

        // Cargar archivos del repositorio original después (almacenado por 24 horas)
        const defaultRepoFiles = await fetchRepoFiles(defaultRepo, true);
        allFiles = allFiles.concat(defaultRepoFiles);

        // Filtrar por término de búsqueda basado en el nombre formateado
        let filteredFiles = allFiles;
        if (searchTerm) {
            const lowerCaseSearchTerm = searchTerm.toLowerCase();
            filteredFiles = allFiles.filter(file => file.formattedName.toLowerCase().includes(lowerCaseSearchTerm));
        }

        // Filtrar por favoritos
        filteredFiles = filteredFiles.filter(file => favoriteFileNames.has(file.name));

        console.log(filteredFiles);

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

    const range = 2; // Cantidad de páginas mostradas a cada lado del input
    
    // Botón para ir a la página anterior
    if (currentPage > 1) {
        const prevButton = document.createElement('button');
        prevButton.textContent = '←';
        prevButton.addEventListener('click', () => {
            fetchMidiFiles(searchTerm, currentPage - 1);
            window.scrollTo(0, 0);
        });
        paginationContainer.appendChild(prevButton);
    }

    // Botón para ir a la primera página
    if (currentPage >= range*2) {
        const firstPageButton = document.createElement('button');
        firstPageButton.textContent = '1';
        firstPageButton.addEventListener('click', () => {
            fetchMidiFiles(searchTerm, 1);
            window.scrollTo(0, 0);
        });
        paginationContainer.appendChild(firstPageButton);
    }

    // Rango de páginas antes del input
    const startPage = Math.max(1, currentPage - range);
    for (let i = startPage; i < currentPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.addEventListener('click', () => {
            fetchMidiFiles(searchTerm, i);
            window.scrollTo(0, 0);
        });
        paginationContainer.appendChild(pageButton);
    }

    // Input para la página actual
    const pageInput = document.createElement('input');
    pageInput.type = 'text';
    pageInput.value = "";
    pageInput.placeholder = currentPage;
    pageInput.classList.add('page-input');
    pageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const page = parseInt(pageInput.value, 10);
            if (!isNaN(page) && page >= 1 && page <= totalPages) {
                fetchMidiFiles(searchTerm, page);
                //window.scrollTo(0, 0);
            } else {
                alert(`Please enter a number between 1 and ${totalPages}`);
            }
        }
    });
    paginationContainer.appendChild(pageInput);

    // Rango de páginas después del input
    const endPage = Math.min(totalPages, currentPage + range);
    
    for (let i = currentPage + 1; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.addEventListener('click', () => {
            fetchMidiFiles(searchTerm, i);
            window.scrollTo(0, 0);
        });
        paginationContainer.appendChild(pageButton);
    }

    // Botón para ir a la última página
    if (currentPage <= totalPages-range-1) {
        const lastPageButton = document.createElement('button');
        lastPageButton.textContent = totalPages;
        lastPageButton.addEventListener('click', () => {
            fetchMidiFiles(searchTerm, totalPages);
            window.scrollTo(0, 0);
        });
        paginationContainer.appendChild(lastPageButton);
    }

    
    // Botón para ir a la página siguiente
    if (currentPage < totalPages) {
        const nextButton = document.createElement('button');
        nextButton.textContent = '→';
        nextButton.addEventListener('click', () => {
            fetchMidiFiles(searchTerm, currentPage + 1);
            window.scrollTo(0, 0);
        });
        paginationContainer.appendChild(nextButton);
    }

    if (searchTerm) {
        // Agregar botón de retroceso para búsquedas
        const backButton = document.getElementById('BackButton');
        backButton.style.display = 'inline';
        backButton.setAttribute('href', '/favorites');
    }

    setTimeout(() => {
        document.getElementById('bottom').style.display = 'block';
    }, 500);
}

function replaceSpaces(inputString) {
    // Use the replace function with a regular expression to replace all spaces with %20
    return inputString.replace(/ /g, '%20');
}

async function displayFileList(files) {
    const customRepos = JSON.parse(localStorage.getItem('customRepos')) || [];
    const isOriginalOnly = customRepos.length <= 1;

    // Cargar el objeto de duraciones de MIDIs desde localStorage
    let midiDurations = JSON.parse(localStorage.getItem('midiDurations')) || {};

    fileListContainer.innerHTML = '';

    if (files.length === 0) {
        fileListContainer.innerHTML = '<p>No favorites found, you can add favorites <a href="/">here</a>.</p>';
        return;
    }

    for (const file of files) {
        const listItem = document.createElement('li');
        if (favoriteFileNames.has(file.name)) {
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

            async function LoadMidiDuration() {
                // Cargar y mostrar la duración
                try {
                    const savedDuration = midiDurations[file.name];
                    if (!savedDuration) {
                        // Cargar la duración del MIDI si no está en el localStorage
                        let midi
    
                        if (isOriginalOnly) {
                            midi = await Midi.fromUrl("https://thewildwestmidis.github.io/midis/" + midiNameUrl);
                        } else {
                            midi = await Midi.fromUrl(`https://raw.githubusercontent.com/${file.repo}/main/${midiNameUrl}`);
                        }
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
    
    
    
            setTimeout(() => {
                LoadMidiDuration();
            }, 10); //Works as "Run in background"
        }
    }

    const copyButtons = document.querySelectorAll('.copy-button');
    copyButtons.forEach(button => {
        button.addEventListener('click', async function () {
            let url = this.getAttribute('data-url');
            let fullUrl = url;

            if (url.includes('thewildwestmidis/midis')) {
                url = url.replace('https://raw.githubusercontent.com/thewildwestmidis/midis/main/', '');
                fullUrl = `https://thewildwestmidis.github.io/midis/${url}`;
            }

            copyToClipboard(fullUrl);

            button.textContent = 'Copied!';

            gtag('event', 'copy_midi_'+decodeURI(url), {
                event_category: 'Midi',
                value: 1
            });

            await new Promise(resolve => setTimeout(() => {
                button.textContent = 'Copy Midi Data';
            }, 1000));
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

                gtag('event', 'favorite_midi_'+fileData.name, {
                    event_category: 'Midi',
                    value: 1
                });
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

    const playButtons = document.querySelectorAll('.play-button');

    playButtons.forEach((playButton, index) => {
        playButton.addEventListener('click', async function () {
            const url = this.getAttribute('data-url');
            const midiplayer = createElementFromHTML('<midi-player class="Midi-player" sound-font visualizer="#myVisualizer"></midi-player>');
            midiplayer.setAttribute("src", url);
            playButton.parentElement.getElementsByClassName("PlayMusicPos")[0].appendChild(midiplayer);
            playButton.remove()
            const fileName = url.split('/').pop();

            gtag('event', 'play_midi_'+decodeURI(fileName), {
                event_category: 'Midi',
                value: 1
            });

            midiplayer.addEventListener('load', () => {
                midiplayer.start();
            });
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