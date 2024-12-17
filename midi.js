const fileListContainer = document.getElementById('file-list');
const urlParams = new URLSearchParams(window.location.search);

function createElementFromHTML(htmlString) {
    var div = document.createElement('div');
    div.innerHTML = htmlString.trim();

    // Change this to div.childNodes to support multiple top-level nodes.
    return div.firstChild;
}

// Definir favoriteFileNames aquí para que esté disponible en todo el archivo script.js
const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
const favoriteFileNames = new Set(favorites.map(file => file.name));

async function fetchMidiFiles(searchTerm = '', page = 1, pageSize = 9999999) {
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

        console.log(filteredFiles);

        if (searchTerm) {
            const filteredFiles = allFiles.filter(file => file.name.toLowerCase().includes(searchTerm));
            displayFileList(filteredFiles, favoriteFileNames); // Pass favoriteFileNames here
        } else {
            displayFileList(allFiles, favoriteFileNames); // Pass favoriteFileNames here
        }

        // Check if the selectedmidi exists in the fetched MIDI files
        const isMidiFound = allFiles.some(file => file.name === selectedmidi);
        if (!isMidiFound) {
            document.body.getElementsByClassName("MidiName")[0].textContent = "Midi Not Found 404"
            document.body.getElementsByClassName("GoBack")[0].textContent = "Go Back"
        }
    } catch (error) {
        console.error('Error fetching MIDI files:', error);
    }
}



function formatFileName(text) {
    // Reemplazar "_" por espacio
    text = text.replace(/_/g, ' ');

    // Eliminar "-" si hay texto a ambos lados
    text = text.replace(/([^ ])-([^ ])/g, '$1 $2');

    // Eliminar ".mid"
    text = text.replace(/\.mid/g, '');

    return text;
}

async function displayFileList(files) {

        // Cargar el objeto de duraciones de MIDIs desde localStorage
        let midiDurations = JSON.parse(localStorage.getItem('midiDurations')) || {};

    fileListContainer.innerHTML = '';

    if (files.length === 0) {
        fileListContainer.innerHTML = '<p>No results found.</p>';
        return;
    }

    const customRepos = JSON.parse(localStorage.getItem('customRepos')) || [];
    const isOriginalOnly = customRepos.length <= 1;

    const durationPromises = files.map(async file => {
        const isFavorite = favoriteFileNames.has(file.name);
        const midiNameUrl = encodeURI(file.name);

        if (selectedmidi.includes(file.name)) {
            filerepo = file.repo
            const listItem = document.createElement('li');
            const isFavorite = favoriteFileNames.has(file.name);
            const repoName = file.repo === 'thewildwestmidis/midis' ? 'thewildwestmidis/midis' : file.repo;

            listItem.innerHTML = `
            <div class="divmidiinfo">
                <p class="midiname">${formatFileName(file.name)}</p>
                <p class="duration"></p>
            </div>
            <button class="copy-button" data-url="https://raw.githubusercontent.com/${file.repo}/main/${midiNameUrl}">Copy Midi Data</button>
            <button class="${isFavorite ? 'remove-favorite-button' : 'favorite-button'}" data-file='${JSON.stringify(file)}'>
                ${isFavorite ? 'Unfavorite' : 'Favorite'}
            </button>
        `;

            fileListContainer.appendChild(listItem);

            //Midi player
            const BaseUrl = "https://raw.githubusercontent.com/" + file.repo + "/main/" + midiNameUrl

            const midiplayer = document.getElementById("midiplayersection").getElementsByClassName("MidPlayer")[0]
            const midivisualizer = document.getElementById("midiplayersection").getElementsByClassName("MidVisualizer")[0]
            midiplayer.setAttribute("sound-font", "");
            midiplayer.setAttribute("visualizer", "#midvis");
            midiplayer.setAttribute("src", BaseUrl);
            midivisualizer.setAttribute("src", BaseUrl);
            document.getElementById("midiplayersection").appendChild(midiplayer);
            document.getElementById("midiplayersection").appendChild(midivisualizer);
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

            document.body.getElementsByClassName("MidiName")[0].textContent = formatFileName(file.name)
            document.title = 'The Wild West Midis - Midi: ' + formatFileName(file.name)
            document.querySelector('meta[property="og:title"]').content = 'The Wild West Midis - Midi: ' + formatFileName(file.name)
        };
    });

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
}

function copyToClipboard(text) {
    const tempInput = document.createElement('input');
    document.body.appendChild(tempInput);
    tempInput.value = text;
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
}

const favoriteButtons = document.querySelectorAll('.favorite-button');
favoriteButtons.forEach(button => {
    button.addEventListener('click', function () {
        const fileData = JSON.parse(this.getAttribute('data-file'));
        const favorites = JSON.parse(localStorage.getItem('favorites')) || [];

        const existingIndex = favorites.findIndex(favorite => favorite.name === fileData.name);
        if (existingIndex !== -1) {
            // Already a favorite, remove it
            favorites.splice(existingIndex, 1);
            this.textContent = 'Favorite';
        } else {
            // Not a favorite, add it
            favorites.push(fileData);
            this.textContent = 'Unfavorite';
        }

        localStorage.setItem('favorites', JSON.stringify(favorites));
    });
});

const selectedmidi = urlParams.get('m');

if (selectedmidi) {
    // Realiza operaciones con el archivo MIDI seleccionado
    console.log('Selected midi:', selectedmidi);
    fetchMidiFiles("");
} else {
    // No se proporcionó un archivo MIDI seleccionado
    console.log('Ningún archivo MIDI seleccionado en la URL');
}

