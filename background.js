var backgroundContainer = document.createElement("div");

function AddBackground() {
    // Obtener el mes actual
    var mesActual = new Date().getMonth() + 1; // Sumamos 1 porque los meses en JavaScript van de 0 a 11

    // Crear el contenedor del fondo

    backgroundContainer.id = "background-container";
    document.body.insertBefore(backgroundContainer, document.body.firstChild); // Insertar antes del primer elemento del body

    // Establecer la imagen de fondo de acuerdo con el mes
    backgroundContainer.style.backgroundImage = "url('Images/Background/" + mesActual + ".png')";
   }

function ChangeCSS() {
    var enlaceEstilos = document.getElementById('estilos');
    enlaceEstilos.href = 'stylesOld.css';
}

if (window.location.search.includes('OldStyles')) {
    backgroundContainer.remove()
    ChangeCSS()
}

AddBackground()