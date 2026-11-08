// Сгенерировано tools/build.mjs. Если язык уже выбран вручную – сразу открываем его версию главной.
(function () {
    var p = {"es":"/es/","es-419":"/es-419/","ru":"/ru/","de":"/de/","fr":"/fr/","fr-CA":"/fr-ca/","it":"/it/","pt-BR":"/pt-br/","pt-PT":"/pt-pt/","ja":"/ja/"}, l = null;
    try { l = localStorage.getItem('lang'); } catch (e) {}
    if (l && p[l] && location.pathname === '/') location.replace(p[l] + location.search + location.hash);
})();
