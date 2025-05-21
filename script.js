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

function formatFileName(filePath) {
    try {
        const knownExtensions = ['mid', 'MID', 'midi', 'MIDI'];

        // Obtener solo el nombre del archivo (sin ruta)
        let fileName = filePath.split('/').pop();

        // Detectar y quitar la extensión (solo si es una conocida)
        const match = fileName.match(/\.(\w+)$/); // Busca la última extensión
        if (match && knownExtensions.includes(match[1].toLowerCase())) {
            fileName = fileName.slice(0, -match[0].length); // Quita ".ext"
        }

        // Reemplazar guiones bajos y guiones por espacios
        fileName = fileName.replace(/[_-]/g, ' ');

        // Capitalizar palabras (solo letras latinas)
        fileName = fileName
            .split(' ')
            .map(word =>
                /^[a-zA-Z]/.test(word)
                    ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                    : word
            )
            .join(' ');

        return fileName;
    } catch (error) {
        console.error(`Error formatting filename ${filePath}:`, error);
        return filePath;
    }
}



async function fetchMidiFiles(searchTerm = '', page = 1, pageSize = 50) {
    try {
        const defaultRepo = 'thewildwestmidis/midis';
        const customRepos = JSON.parse(localStorage.getItem('customRepos')) || [];
        let allFiles = [];

        const cacheDefaultDuration = 30 * 24 * 60 * 60 * 1000; // 1 mes en milisegundos
        const cacheCustomDuration = 7 * 24 * 60 * 60 * 1000; // 1 semana en milisegundos


        // Configuración de caché mejorada
        const CACHE_CONFIG = {
            defaultDuration: 1 * 60 * 60 * 1000, // 1 horas para datos frescos
            fallbackDuration: 24 * 60 * 60 * 1000 // 24 horas para datos cacheados como fallback
        };

        const cache = {
            get: (key, allowExpired = false) => {
                const item = localStorage.getItem(key);
                if (!item) return null;

                const { value, timestamp } = JSON.parse(item);
                const age = Date.now() - timestamp;

                // Permitir datos expirados como fallback
                if (allowExpired) {
                    return age < CACHE_CONFIG.fallbackDuration ? value : null;
                }

                return age < CACHE_CONFIG.defaultDuration ? value : null;
            },
            set: (key, value) => {
                localStorage.setItem(key, JSON.stringify({
                    value,
                    timestamp: Date.now()
                }));
            }
        };

        // Función mejorada para obtener el último commit con estrategia de fallback
        async function getLastCommitDate(repo) {
            const cacheKey = `lastCommit_${repo}`;

            try {
                // 1. Intentar obtener datos frescos primero
                const cached = cache.get(cacheKey);
                if (cached) {
                    console.log(`[Cache] Using fresh commit date for ${repo}`);
                    return new Date(cached);
                }

                // 2. Intentar hacer nueva petición a la API
                console.log(`[API] Fetching commit date for ${repo}`);
                const response = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                const commitDate = data[0]?.commit?.committer?.date;

                if (!commitDate) throw new Error('No commit date found in response');

                // Guardar en caché si la respuesta es válida
                cache.set(cacheKey, commitDate);
                return new Date(commitDate);

            } catch (error) {
                console.error(`[Error] Failed to get commit date for ${repo}:`, error.message);

                // 3. Intentar usar caché expirada como fallback
                const expiredCache = cache.get(cacheKey, true);
                if (expiredCache) {
                    console.warn(`[Fallback] Using expired cache for ${repo}`);
                    return new Date(expiredCache);
                }

                // 4. Último recurso: fecha actual con advertencia
                console.warn(`[Final Fallback] Using current date for ${repo}`);
                return new Date();
            }
        }


        // Función para obtener archivos de un repositorio con caché mejorada
        async function fetchRepoFiles(repo, isDefault = false) {
            const cacheKey = `repoFiles_${repo}`;
            const cachedData = localStorage.getItem(cacheKey);

            // Obtener fecha del último commit
            const lastCommitDate = await getLastCommitDate(repo);

            // Verificar si hay datos en caché
            if (cachedData) {
                const cached = JSON.parse(cachedData);
                const currentTime = new Date().getTime();
                const cacheDuration = isDefault ? cacheDefaultDuration : cacheCustomDuration;

                // Si hay un commit más reciente que la caché, ignorar el tiempo de caché
                const shouldUseCache = lastCommitDate ?
                    new Date(cached.timestamp) > lastCommitDate &&
                    (currentTime - cached.timestamp < cacheDuration) :
                    (currentTime - cached.timestamp < cacheDuration);

                if (shouldUseCache) {
                    console.log(`Using cache for ${repo}`);
                    return cached.files;
                }
                console.log(`Cache for ${repo} expired or repo has new commits`);
            }

            // Si no hay caché válida, hacer la solicitud a la API
            try {
                console.log(`Fetching fresh data for ${repo}`);

                // Primero obtener todos los archivos del repositorio
                const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`);
                const data = await response.json();

                if (!data.tree) {
                    console.log(`No files found in ${repo}`);
                    return [];
                }

                // Procesar archivos con manejo de errores para nombres
                const repoFiles = data.tree.map(item => {
                    try {
                        return {
                            ...item,
                            name: item.path,
                            repo: repo,
                            formattedName: formatFileName(item.path) // Guardar el nombre formateado
                        };
                    } catch (error) {
                        console.error(`Error formatting file name for ${item.path}:`, error);
                        return {
                            ...item,
                            name: item.path,
                            repo: repo,
                            formattedName: item.path // Usar el nombre original si falla el formateo
                        };
                    }
                });

                // Filtrar archivos MIDI (con múltiples extensiones)
                const midiExtensions = ['.mid', '.midi', '.MID', '.MIDI'];
                const midiFiles = repoFiles.filter(item =>
                    midiExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
                );

                // Guardar los archivos en caché con timestamp actual
                const cacheData = {
                    timestamp: new Date().getTime(),
                    files: midiFiles,
                    lastCommitChecked: lastCommitDate ? lastCommitDate.getTime() : null
                };

                localStorage.setItem(cacheKey, JSON.stringify(cacheData));

                return midiFiles;
            } catch (error) {
                console.error(`Error fetching files from ${repo}:`, error);

                // En caso de error, intentar usar los archivos almacenados previamente (si hay)
                if (cachedData) {
                    const cached = JSON.parse(cachedData);
                    console.log(`Falling back to cached data for ${repo} due to error`);
                    return cached.files;
                }

                // Si no hay caché, retornar un array vacío
                return [];
            }
        }



        // Cargar archivos de todas las fuentes
        async function loadAllFiles() {
            let allFiles = [];

            // 1. Cargar custom links primero (si existen)
            try {
                const customLinksText = localStorage.getItem('customLinks') || '';
                if (customLinksText.trim()) {
                    const customFiles = processCustomLinks(customLinksText);
                    allFiles = allFiles.concat(customFiles);
                    console.log(`Loaded ${customFiles.length} custom links`);
                }
            } catch (error) {
                console.error('Error loading custom links:', error);
            }

            // 2. Cargar repositorios custom
            const customRepos = JSON.parse(localStorage.getItem('customRepos')) || [];
            for (const repo of customRepos) {
                if (repo !== defaultRepo) {
                    try {
                        const repoFiles = await fetchRepoFiles(repo);
                        allFiles = allFiles.concat(repoFiles);
                        console.log(`Loaded ${repoFiles.length} files from ${repo}`);
                    } catch (error) {
                        console.error(`Error loading files from ${repo}:`, error);
                    }
                }
            }

            // 3. Cargar repositorio por defecto
            try {
                const defaultRepoFiles = await fetchRepoFiles(defaultRepo, true);
                allFiles = allFiles.concat(defaultRepoFiles);
                console.log(`Loaded ${defaultRepoFiles.length} files from default repo`);
            } catch (error) {
                console.error('Error loading default repo:', error);
            }

            return allFiles.filter(file => file); // Filtrar posibles valores nulos
        }

        // Función para procesar custom links con manejo de errores
        function processCustomLinks(text) {
            return text.split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .map(line => {
                    try {
                        const [url, ...nameParts] = line.split('|').map(part => part.trim());
                        if (!url) return null;

                        const customName = nameParts.join('|') ||
                            url.split('/').pop().split('.')[0] ||
                            'Custom MIDI';

                        return {
                            name: customName,
                            url: url,
                            repo: 'custom',
                            formattedName: formatFileName(customName),
                            custom: true,
                            path: url // Para consistencia con los otros archivos
                        };
                    } catch (error) {
                        console.error(`Error processing custom link: "${line}"`, error);
                        return null;
                    }
                })
                .filter(link => link); // Filtrar entradas nulas
        }

        // Uso completo
        (async () => {
            try {
                // Cargar todos los archivos
                let allFiles = await loadAllFiles();
                console.log(`Total files loaded: ${allFiles.length}`);

                // Filtrar por término de búsqueda basado en el nombre formateado
                let filteredFiles = allFiles;
                if (searchTerm) {
                    const lowerCaseSearchTerm = searchTerm.toLowerCase();
                    filteredFiles = allFiles.filter(file => file.formattedName.toLowerCase().includes(lowerCaseSearchTerm));
                }
                console.log(`Total files with filtering: ${filteredFiles.length}`);
                console.log(filteredFiles)

                currentPage = page;
                const startIndex = (currentPage - 1) * pageSize;
                const endIndex = startIndex + pageSize;
                const paginatedFiles = filteredFiles.slice(startIndex, endIndex);

                // Mostrar resultados
                displayFileList(paginatedFiles);

                const totalPages = Math.ceil(filteredFiles.length / pageSize);
                generatePagination(totalPages, currentPage, searchTerm);
            } catch (error) {
                console.error('Error in main process:', error);
                console.error('Failed to load files. Please try again later.');
            }
        })();
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
    if (currentPage >= range * 2) {
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
                window.scrollTo(0, 0);
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
    if (currentPage <= totalPages - range - 1) {
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
        backButton.setAttribute('href', '/');
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
        fileListContainer.innerHTML = '<p>No results found.</p>';
        return;
    }

    for (const file of files) {
        const listItem = document.createElement('li');
        const isFavorite = favoriteFileNames.has(file.name);
        const midiNameUrl = encodeURI(file.name);

        // Determinar la fuente del archivo
        const isCustomLink = file.custom;
        const isDefaultRepo = file.repo === 'thewildwestmidis/midis';
        const repoName = isCustomLink ? 'Custom Link' : file.repo;

        // Construir la URL del MIDI según su tipo
        let midiUrl;
        if (isCustomLink) {
            midiUrl = file.url; // Usar la URL directa para custom links
        } else if (isOriginalOnly && isDefaultRepo) {
            midiUrl = `https://thewildwestmidis.github.io/midis/${midiNameUrl}`;
        } else {
            midiUrl = `https://raw.githubusercontent.com/${file.repo}/main/${midiNameUrl}`;
        }

        listItem.innerHTML = `
        <div class="divmidiinfo">
            <p class="midiname"><a href="/midi?m=${midiNameUrl}&source=${isCustomLink ? 'custom' : 'repo'}&repo=${encodeURIComponent(file.repo)}" 
               style="color: inherit; text-decoration: none;">
               ${formatFileName(file.name)}</a></p>
            <p class="duration"></p>
        </div>
        <button class="play-button" data-url="${midiUrl}">►</button>
        <div class="PlayMusicPos"></div>
        <button class="copy-button" data-url="${midiUrl}">Copy Midi Data</button>
        <button class="${isFavorite ? 'remove-favorite-button' : 'favorite-button'}" 
                data-file='${JSON.stringify(file)}'>
            ${isFavorite ? 'Unfavorite' : 'Favorite'}
        </button>
    `;

        fileListContainer.appendChild(listItem);

        // Función para cargar y mostrar la duración
        async function LoadMidiDuration() {
            try {
                const savedDuration = midiDurations[file.name];
                if (!savedDuration) {
                    // Cargar la duración del MIDI si no está en el localStorage
                    let midi;

                    try {
                        midi = await Midi.fromUrl(midiUrl);
                        const durationInSeconds = midi.duration;
                        const minutes = Math.floor(durationInSeconds / 60);
                        const seconds = Math.round(durationInSeconds % 60);
                        const durationText = `${minutes} min, ${seconds < 10 ? '0' : ''}${seconds} sec`;

                        // Actualizar el almacenamiento local
                        midiDurations[file.name] = durationText;
                        localStorage.setItem('midiDurations', JSON.stringify(midiDurations));

                        // Actualizar el DOM
                        const durationDiv = listItem.querySelector('.duration');
                        if (durationDiv) {
                            durationDiv.textContent = `${!isOriginalOnly || !isDefaultRepo ? repoName + ' - ' : ''}${durationText}`;
                        }
                    } catch (loadError) {
                        console.warn('Cannot load duration of midi:', file.name, ' - ', loadError);
                        const durationDiv = listItem.querySelector('.duration');
                        if (durationDiv) {
                            durationDiv.textContent = `${!isOriginalOnly || !isDefaultRepo ? repoName + ' - ' : ''}Failed to load duration`;
                        }
                    }
                } else {
                    // Si la duración ya está en localStorage
                    const durationDiv = listItem.querySelector('.duration');
                    if (durationDiv) {
                        durationDiv.textContent = `${!isOriginalOnly || !isDefaultRepo ? repoName + ' - ' : ''}${savedDuration}`;
                    }
                }
            } catch (error) {
                console.error('Error in duration loading process:', error);
            }
        }



        setTimeout(() => {
            LoadMidiDuration();
        }, 10); //Works as "Run in background"
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

            gtag('event', 'copy_midi_' + decodeURI(url), {
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

                gtag('event', 'favorite_midi_' + fileData.name, {
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

            gtag('event', 'play_midi_' + decodeURI(fileName), {
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