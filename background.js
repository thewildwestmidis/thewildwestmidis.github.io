// Verificar si la URL contiene el parámetro "?test1"
if (window.location.search.includes('test1')) {
    // Obtener el mes actual
    var mesActual = new Date().getMonth() + 1; // Sumamos 1 porque los meses en JavaScript van de 0 a 11

    // Crear el contenedor del fondo
    var backgroundContainer = document.createElement("div");
    backgroundContainer.id = "background-container";
    document.body.insertBefore(backgroundContainer, document.body.firstChild); // Insertar antes del primer elemento del body

    // Establecer la imagen de fondo de acuerdo con el mes
    backgroundContainer.style.backgroundImage = "url('Images/Background/" + mesActual + ".png')";
    backgroundContainer.style.backgroundSize = "cover"; // Ajustar el tamaño de la imagen de fondo
    backgroundContainer.style.position = "fixed";
    backgroundContainer.style.top = "0";
    backgroundContainer.style.left = "0";
    backgroundContainer.style.width = "100%";
    backgroundContainer.style.height = "100%";
    backgroundContainer.style.filter = "blur(5px)"; // Aplicar un desenfoque de 5px
    backgroundContainer.style.zIndex = "-1"; // Establecer el índice z detrás del contenido principal
}
