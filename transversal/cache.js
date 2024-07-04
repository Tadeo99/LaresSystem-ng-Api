class CacheService {
    constructor() {
      this.cache = {}; // Inicializamos la caché como un objeto vacío
    }
  
    setCache(key, value) {
      this.cache[key] = value; // Guardamos el valor en la caché usando la clave especificada
    }
  
    getCache(key) {
      return this.cache[key] || null; // Recuperamos el valor asociado con la clave especificada
    }
  
    deleteCache(key) {
      delete this.cache[key]; // Eliminamos el valor asociado con la clave especificada
    }
  
    flushCache() {
      this.cache = {}; // Limpiamos toda la caché
    }
  }