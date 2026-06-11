// Catálogo semilla: marcas/tamaños comunes en Argentina.
// type: "alimento" | "accesorio".  sizes: kilos preseteados (vacío para accesorios).
// Se complementa en runtime con los productos ya cargados en la base.
export const CATALOG = [
  // ---- Perro · alimento seco ----
  { name: "Royal Canin Maxi Adult", species: "dog", type: "alimento", sizes: [3, 15] },
  { name: "Royal Canin Medium Adult", species: "dog", type: "alimento", sizes: [3, 15] },
  { name: "Royal Canin Mini Adult", species: "dog", type: "alimento", sizes: [1, 3, 7.5] },
  { name: "Royal Canin Maxi Puppy", species: "dog", type: "alimento", sizes: [3, 15] },
  { name: "Pro Plan Adult", species: "dog", type: "alimento", sizes: [3, 7.5, 15 ] },
  { name: "Pro Plan Puppy", species: "dog", type: "alimento", sizes: [3, 7.5, 15] },
  { name: "Pro Plan Adult Small & Mini", species: "dog", type: "alimento", sizes: [3, 7.5] },
  { name: "Eukanuba Adult", species: "dog", type: "alimento", sizes: [3, 15] },
  { name: "Old Prince Equilibrium Adult", species: "dog", type: "alimento", sizes: [3, 7.5, 15, 20] },
  { name: "Old Prince Novo Adult", species: "dog", type: "alimento", sizes: [7.5, 15] },
  { name: "Excellent Adult", species: "dog", type: "alimento", sizes: [3, 15, 22] },
  { name: "Vital Can Adult", species: "dog", type: "alimento", sizes: [3, 15, 20] },
  { name: "Dog Chow Adultos", species: "dog", type: "alimento", sizes: [3, 8, 15, 21] },
  { name: "Dog Chow Cachorros", species: "dog", type: "alimento", sizes: [3, 8, 15, 21] },
  { name: "Pedigree Adulto", species: "dog", type: "alimento", sizes: [3, 8, 15, 21] },
  { name: "Eukanuba Puppy", species: "dog", type: "alimento", sizes: [3, 15] },
  { name: "Nutrique Adult", species: "dog", type: "alimento", sizes: [3, 7.5, 15] },
  { name: "Biopet Adult", species: "dog", type: "alimento", sizes: [3, 15, 20] },

  // ---- Gato · alimento seco ----
  { name: "Royal Canin Feline Adult", species: "cat", type: "alimento", sizes: [1.5, 7.5] },
  { name: "Royal Canin Kitten", species: "cat", type: "alimento", sizes: [1.5, 7.5] },
  { name: "Pro Plan Cat Adult", species: "cat", type: "alimento", sizes: [1, 3, 7.5] },
  { name: "Cat Chow Adultos", species: "cat", type: "alimento", sizes: [1.5, 3, 8, 15] },
  { name: "Whiskas Adulto", species: "cat", type: "alimento", sizes: [1.5, 3, 8 ] },
  { name: "Excellent Gato Adulto", species: "cat", type: "alimento", sizes: [3, 7.5 ] },
  { name: "Vital Can Gato Adulto", species: "cat", type: "alimento", sizes: [1.5, 3, 7.5] },

  // ---- Gato · sanitario ----
  { name: "Piedras sanitarias", species: "cat", type: "accesorio", sizes: [] },

  // ---- Accesorios (sin kilos) ----
  { name: "Collar", species: "other", type: "accesorio", sizes: [] },
  { name: "Correa", species: "other", type: "accesorio", sizes: [] },
  { name: "Pechera", species: "other", type: "accesorio", sizes: [] },
  { name: "Juguete", species: "other", type: "accesorio", sizes: [] },
  { name: "Comedero", species: "other", type: "accesorio", sizes: [] },
  { name: "Bebedero", species: "other", type: "accesorio", sizes: [] },
  { name: "Cama", species: "other", type: "accesorio", sizes: [] },
  { name: "Rascador", species: "cat", type: "accesorio", sizes: [] },
  { name: "Paños / Apósitos", species: "other", type: "accesorio", sizes: [] },
  { name: "Shampoo", species: "other", type: "accesorio", sizes: [] },
  { name: "Antipulgas / Pipeta", species: "other", type: "accesorio", sizes: [] },
];
