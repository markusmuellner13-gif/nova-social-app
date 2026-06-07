export type Locale = 'en' | 'de' | 'es' | 'fr' | 'it' | 'pt' | 'nl' | 'ja';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français',
  it: 'Italiano', pt: 'Português', nl: 'Nederlands', ja: '日本語',
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  en: '🇬🇧', de: '🇩🇪', es: '🇪🇸', fr: '🇫🇷',
  it: '🇮🇹', pt: '🇧🇷', nl: '🇳🇱', ja: '🇯🇵',
};

export interface AppTranslations {
  nav: { discover: string; explore: string; groups: string; activity: string; profile: string };
  feed: {
    events: string; sightseeing: string; sport: string; partners: string;
    forYou: string; recent: string; chooseCity: string; filters: string;
    date: string; price: string; allDates: string; today: string; weekend: string;
    thisWeek: string; thisMonth: string; anyPrice: string; free: string;
    newContent: string; allCaughtUp: string; pullRefresh: string; loadingMore: string;
    eventsNear: string; sightseeingNear: string; sportNear: string;
    sortedByDate: string; featuredPartners: string; sponsoredPlacements: string;
    findingEvents: string; findingMore: string; loading: string;
    basedOnInterests: string; moreLove: string; curatedForYou: string;
    wantFeatured: string; contactUs: string; backToTop: string;
  };
  profile: {
    events: string; going: string; following: string; liked: string; saved: string;
    calendar: string; badges: string; editProfile: string; findFriends: string;
    signInSync: string; feedPreferences: string; feedPreferencesDesc: string;
    noLikedPosts: string; noLikedHint: string; noSavedPosts: string; noSavedHint: string;
    noUpcomingEvents: string; saveEventsHint: string;
    badgesEarned: string; nextBadge: string; seeAll: string;
    dataOnDevice: string; dataSyncHint: string;
    earned: string; badges_title: string;
    today: string; tomorrow: string; daysAway: string; going_label: string;
  };
  settings: {
    title: string; changePhoto: string; requestVerification: string;
    locationOn: string; locationOff: string; privacy: string;
    notificationSettings: string; clearData: string; signOut: string; language: string;
    clearConfirmTitle: string; clearConfirmDesc: string; clearCancel: string; clearButton: string;
    selectLanguage: string; languageDesc: string;
    comingSoon: string; privacyMsg: string; verificationSent: string; locationEnabled: string; locationDisabled: string;
  };
  notifications: {
    title: string; markAllRead: string; new_section: string; earlier: string;
    empty: string; emptyHint: string;
    enablePush: string; enablePushDesc: string; enableButton: string;
  };
  common: {
    save: string; saved: string; follow: string; following: string;
    more: string; cancel: string; clear: string;
    getTickets: string; aiDiscovered: string; partner: string; sponsored: string;
    event: string; goingLabel: string; today: string; tomorrow: string; daysAway: string;
    searchUsers: string; noUsersFound: string; yourStory: string;
  };
  categories: {
    travel: string; food: string; fashion: string; sports: string; art: string;
    tech: string; fitness: string; music: string; pets: string; lifestyle: string;
    events: string; sightseeing: string;
    shops: string; venues: string; community: string;
  };
}

const en: AppTranslations = {
  nav: { discover: 'Discover', explore: 'Explore', groups: 'Groups', activity: 'Activity', profile: 'Profile' },
  feed: {
    events: 'Events', sightseeing: 'Sightseeing', sport: 'Sport', partners: 'Partners',
    forYou: 'For You', recent: 'Recent', chooseCity: 'Choose city', filters: 'Filters',
    date: 'DATE', price: 'PRICE', allDates: 'All dates', today: 'Today', weekend: 'Weekend',
    thisWeek: 'This week', thisMonth: 'This month', anyPrice: 'Any price', free: 'Free',
    newContent: 'New content just dropped — tap to load',
    allCaughtUp: "You're all caught up ✨", pullRefresh: 'Pull down to refresh for new content',
    loadingMore: 'Loading more…', eventsNear: 'Events near', sightseeingNear: 'Sightseeing near',
    sportNear: 'Sport near', sortedByDate: 'Sorted by date', featuredPartners: 'Featured Partners',
    sponsoredPlacements: 'Sponsored placements', findingEvents: 'Finding events in',
    findingMore: 'Finding more in', loading: 'Loading…',
    basedOnInterests: 'Based on your top interests', moreLove: "More you'll love",
    curatedForYou: 'Curated just for you', wantFeatured: 'Want to be featured here?',
    contactUs: 'Contact us at partners@nova-app.com · From €300/month', backToTop: 'Back to top',
  },
  profile: {
    events: 'Events', going: 'Going', following: 'Following', liked: 'Liked',
    saved: 'Saved', calendar: 'Calendar', badges: 'Badges',
    editProfile: 'Edit Profile', findFriends: 'Find Friends', signInSync: 'Sign in to sync across devices',
    feedPreferences: 'Feed Preferences', feedPreferencesDesc: 'Tune your AI algorithm',
    noLikedPosts: 'No liked posts yet', noLikedHint: 'Tap ⭐ on any post to like it',
    noSavedPosts: 'Nothing saved yet', noSavedHint: 'Tap 🔖 on any post to save it',
    noUpcomingEvents: 'No upcoming events', saveEventsHint: 'Save events or mark "Going" to see them here',
    badgesEarned: 'EARNED', nextBadge: 'Next:', seeAll: 'See all →',
    dataOnDevice: 'Your data is only on this device',
    dataSyncHint: 'Sign in to sync likes, saves, and reminders across all your devices.',
    earned: 'Earned', badges_title: 'Badges',
    today: 'Today', tomorrow: 'Tomorrow', daysAway: 'd away', going_label: '✓ Going',
  },
  settings: {
    title: 'Settings', changePhoto: 'Change Profile Photo', requestVerification: 'Request Verification',
    locationOn: 'Location', locationOff: 'Enable Location', privacy: 'Privacy & Security',
    notificationSettings: 'Notification Settings', clearData: 'Clear All Data', signOut: 'Sign Out',
    language: 'Language', selectLanguage: 'Select Language', languageDesc: 'App language',
    clearConfirmTitle: 'Clear all data?',
    clearConfirmDesc: 'Deletes preferences, likes, saves, and local data. Cannot be undone.',
    clearCancel: 'Cancel', clearButton: 'Clear',
    comingSoon: 'Coming soon', privacyMsg: 'Your data is AES-256 encrypted on this device',
    verificationSent: 'Application submitted ✓', locationEnabled: 'Location enabled',
    locationDisabled: 'Location disabled',
  },
  notifications: {
    title: 'Activity', markAllRead: 'Mark all read', new_section: 'New', earlier: 'Earlier',
    empty: 'No activity yet', emptyHint: 'Event updates and discoveries will appear here',
    enablePush: 'Stay in the loop 🔔',
    enablePushDesc: 'Enable push notifications so Nova can alert you when new content matches your interests.',
    enableButton: 'Enable Notifications',
  },
  common: {
    save: 'Save', saved: 'Saved', follow: 'Follow', following: 'Following',
    more: 'more', cancel: 'Cancel', clear: 'Clear',
    getTickets: 'Get Tickets & Info', aiDiscovered: 'AI Discovered',
    partner: 'PARTNER', sponsored: 'Sponsored', event: 'EVENT',
    goingLabel: "You're going! 🎉", today: 'Today!', tomorrow: 'Tomorrow!', daysAway: 'days away',
    searchUsers: 'Search by username…', noUsersFound: 'No users found', yourStory: 'Your story',
  },
  categories: {
    travel: 'Travel', food: 'Food', fashion: 'Fashion', sports: 'Sports', art: 'Art',
    tech: 'Tech', fitness: 'Fitness', music: 'Music', pets: 'Pets', lifestyle: 'Lifestyle',
    events: 'Events', sightseeing: 'Sightseeing',
    shops: 'Shops', venues: 'Venues', community: 'Community',
  },
};

const de: AppTranslations = {
  nav: { discover: 'Entdecken', explore: 'Erkunden', groups: 'Gruppen', activity: 'Aktivität', profile: 'Profil' },
  feed: {
    events: 'Events', sightseeing: 'Sehenswürdigkeiten', sport: 'Sport', partners: 'Partner',
    forYou: 'Für dich', recent: 'Aktuell', chooseCity: 'Stadt wählen', filters: 'Filter',
    date: 'DATUM', price: 'PREIS', allDates: 'Alle Termine', today: 'Heute', weekend: 'Wochenende',
    thisWeek: 'Diese Woche', thisMonth: 'Diesen Monat', anyPrice: 'Jeder Preis', free: 'Kostenlos',
    newContent: 'Neue Inhalte verfügbar — tippen zum Laden',
    allCaughtUp: 'Du bist auf dem neuesten Stand ✨', pullRefresh: 'Runterziehen für neue Inhalte',
    loadingMore: 'Mehr laden…', eventsNear: 'Events in der Nähe von', sightseeingNear: 'Sehenswürdigkeiten in',
    sportNear: 'Sport in', sortedByDate: 'Nach Datum sortiert', featuredPartners: 'Ausgewählte Partner',
    sponsoredPlacements: 'Gesponserte Platzierungen', findingEvents: 'Events werden gesucht in',
    findingMore: 'Mehr suchen in', loading: 'Lädt…',
    basedOnInterests: 'Basierend auf deinen Interessen', moreLove: 'Mehr, das dir gefällt',
    curatedForYou: 'Nur für dich kuratiert', wantFeatured: 'Möchtest du hier erscheinen?',
    contactUs: 'Kontaktiere uns: partners@nova-app.com · Ab €300/Monat', backToTop: 'Nach oben',
  },
  profile: {
    events: 'Events', going: 'Ich gehe hin', following: 'Folge ich', liked: 'Gefällt mir',
    saved: 'Gespeichert', calendar: 'Kalender', badges: 'Abzeichen',
    editProfile: 'Profil bearbeiten', findFriends: 'Freunde finden', signInSync: 'Anmelden zum Synchronisieren',
    feedPreferences: 'Feed-Einstellungen', feedPreferencesDesc: 'KI-Algorithmus anpassen',
    noLikedPosts: 'Noch keine gelikten Beiträge', noLikedHint: 'Tippe ⭐ auf einen Beitrag',
    noSavedPosts: 'Noch nichts gespeichert', noSavedHint: 'Tippe 🔖 auf einen Beitrag',
    noUpcomingEvents: 'Keine bevorstehenden Events', saveEventsHint: 'Speichere Events oder markiere "Ich gehe hin"',
    badgesEarned: 'ERHALTEN', nextBadge: 'Nächstes:', seeAll: 'Alle anzeigen →',
    dataOnDevice: 'Deine Daten sind nur auf diesem Gerät',
    dataSyncHint: 'Melde dich an, um Likes und Saves zu synchronisieren.',
    earned: 'Erhalten', badges_title: 'Abzeichen',
    today: 'Heute', tomorrow: 'Morgen', daysAway: 'T weg', going_label: '✓ Ich gehe',
  },
  settings: {
    title: 'Einstellungen', changePhoto: 'Profilbild ändern', requestVerification: 'Verifizierung beantragen',
    locationOn: 'Standort', locationOff: 'Standort aktivieren', privacy: 'Datenschutz & Sicherheit',
    notificationSettings: 'Benachrichtigungen', clearData: 'Alle Daten löschen', signOut: 'Abmelden',
    language: 'Sprache', selectLanguage: 'Sprache auswählen', languageDesc: 'App-Sprache',
    clearConfirmTitle: 'Alle Daten löschen?',
    clearConfirmDesc: 'Löscht Einstellungen, Likes und lokale Daten. Nicht rückgängig zu machen.',
    clearCancel: 'Abbrechen', clearButton: 'Löschen',
    comingSoon: 'Demnächst', privacyMsg: 'Deine Daten sind AES-256-verschlüsselt',
    verificationSent: 'Antrag eingereicht ✓', locationEnabled: 'Standort aktiviert',
    locationDisabled: 'Standort deaktiviert',
  },
  notifications: {
    title: 'Aktivität', markAllRead: 'Alle als gelesen markieren', new_section: 'Neu', earlier: 'Früher',
    empty: 'Noch keine Aktivität', emptyHint: 'Event-Updates erscheinen hier',
    enablePush: 'Bleib informiert 🔔',
    enablePushDesc: 'Aktiviere Push-Benachrichtigungen für neue passende Inhalte.',
    enableButton: 'Benachrichtigungen aktivieren',
  },
  common: {
    save: 'Speichern', saved: 'Gespeichert', follow: 'Folgen', following: 'Gefolgt',
    more: 'mehr', cancel: 'Abbrechen', clear: 'Löschen',
    getTickets: 'Tickets & Infos', aiDiscovered: 'KI-Entdeckung',
    partner: 'PARTNER', sponsored: 'Gesponsert', event: 'EVENT',
    goingLabel: 'Du gehst hin! 🎉', today: 'Heute!', tomorrow: 'Morgen!', daysAway: 'Tage',
    searchUsers: 'Nach Nutzernamen suchen…', noUsersFound: 'Keine Nutzer gefunden', yourStory: 'Deine Story',
  },
  categories: {
    travel: 'Reisen', food: 'Essen', fashion: 'Mode', sports: 'Sport', art: 'Kunst',
    tech: 'Tech', fitness: 'Fitness', music: 'Musik', pets: 'Haustiere', lifestyle: 'Lifestyle',
    events: 'Events', sightseeing: 'Sehenswürdigkeiten',
    shops: 'Läden', venues: 'Veranstaltungsorte', community: 'Community',
  },
};

const es: AppTranslations = {
  nav: { discover: 'Descubrir', explore: 'Explorar', groups: 'Grupos', activity: 'Actividad', profile: 'Perfil' },
  feed: {
    events: 'Eventos', sightseeing: 'Turismo', sport: 'Deporte', partners: 'Socios',
    forYou: 'Para ti', recent: 'Reciente', chooseCity: 'Elegir ciudad', filters: 'Filtros',
    date: 'FECHA', price: 'PRECIO', allDates: 'Todas las fechas', today: 'Hoy', weekend: 'Fin de semana',
    thisWeek: 'Esta semana', thisMonth: 'Este mes', anyPrice: 'Cualquier precio', free: 'Gratis',
    newContent: 'Nuevo contenido disponible — toca para cargar',
    allCaughtUp: 'Estás al día ✨', pullRefresh: 'Desliza para refrescar',
    loadingMore: 'Cargando más…', eventsNear: 'Eventos cerca de', sightseeingNear: 'Turismo en',
    sportNear: 'Deporte en', sortedByDate: 'Ordenado por fecha', featuredPartners: 'Socios destacados',
    sponsoredPlacements: 'Espacios patrocinados', findingEvents: 'Buscando eventos en',
    findingMore: 'Buscando más en', loading: 'Cargando…',
    basedOnInterests: 'Basado en tus intereses', moreLove: 'Más que te encantará',
    curatedForYou: 'Seleccionado para ti', wantFeatured: '¿Quieres aparecer aquí?',
    contactUs: 'Contáctanos: partners@nova-app.com · Desde €300/mes', backToTop: 'Volver arriba',
  },
  profile: {
    events: 'Eventos', going: 'Voy', following: 'Siguiendo', liked: 'Me gusta',
    saved: 'Guardado', calendar: 'Calendario', badges: 'Insignias',
    editProfile: 'Editar perfil', findFriends: 'Buscar amigos', signInSync: 'Inicia sesión para sincronizar',
    feedPreferences: 'Preferencias de feed', feedPreferencesDesc: 'Ajusta tu algoritmo de IA',
    noLikedPosts: 'Sin publicaciones con me gusta', noLikedHint: 'Toca ⭐ en cualquier publicación',
    noSavedPosts: 'Nada guardado aún', noSavedHint: 'Toca 🔖 en cualquier publicación',
    noUpcomingEvents: 'Sin eventos próximos', saveEventsHint: 'Guarda eventos o marca "Voy"',
    badgesEarned: 'OBTENIDAS', nextBadge: 'Siguiente:', seeAll: 'Ver todas →',
    dataOnDevice: 'Tus datos solo están en este dispositivo',
    dataSyncHint: 'Inicia sesión para sincronizar entre dispositivos.',
    earned: 'Obtenida', badges_title: 'Insignias',
    today: 'Hoy', tomorrow: 'Mañana', daysAway: 'd', going_label: '✓ Voy',
  },
  settings: {
    title: 'Ajustes', changePhoto: 'Cambiar foto de perfil', requestVerification: 'Solicitar verificación',
    locationOn: 'Ubicación', locationOff: 'Activar ubicación', privacy: 'Privacidad y seguridad',
    notificationSettings: 'Notificaciones', clearData: 'Borrar todos los datos', signOut: 'Cerrar sesión',
    language: 'Idioma', selectLanguage: 'Seleccionar idioma', languageDesc: 'Idioma de la app',
    clearConfirmTitle: '¿Borrar todos los datos?',
    clearConfirmDesc: 'Elimina preferencias, me gusta y datos locales. No se puede deshacer.',
    clearCancel: 'Cancelar', clearButton: 'Borrar',
    comingSoon: 'Próximamente', privacyMsg: 'Tus datos están cifrados con AES-256',
    verificationSent: 'Solicitud enviada ✓', locationEnabled: 'Ubicación activada',
    locationDisabled: 'Ubicación desactivada',
  },
  notifications: {
    title: 'Actividad', markAllRead: 'Marcar todo como leído', new_section: 'Nuevo', earlier: 'Anterior',
    empty: 'Sin actividad aún', emptyHint: 'Las actualizaciones de eventos aparecerán aquí',
    enablePush: 'Mantente al día 🔔',
    enablePushDesc: 'Activa las notificaciones push para recibir alertas de eventos.',
    enableButton: 'Activar notificaciones',
  },
  common: {
    save: 'Guardar', saved: 'Guardado', follow: 'Seguir', following: 'Siguiendo',
    more: 'más', cancel: 'Cancelar', clear: 'Borrar',
    getTickets: 'Entradas e info', aiDiscovered: 'Descubierto por IA',
    partner: 'SOCIO', sponsored: 'Patrocinado', event: 'EVENTO',
    goingLabel: '¡Vas a ir! 🎉', today: '¡Hoy!', tomorrow: '¡Mañana!', daysAway: 'd',
    searchUsers: 'Buscar por nombre de usuario…', noUsersFound: 'Sin usuarios', yourStory: 'Tu historia',
  },
  categories: {
    travel: 'Viajes', food: 'Comida', fashion: 'Moda', sports: 'Deportes', art: 'Arte',
    tech: 'Tecnología', fitness: 'Fitness', music: 'Música', pets: 'Mascotas', lifestyle: 'Estilo de vida',
    events: 'Eventos', sightseeing: 'Turismo',
    shops: 'Tiendas', venues: 'Locales', community: 'Comunidad',
  },
};

const fr: AppTranslations = {
  nav: { discover: 'Découvrir', explore: 'Explorer', groups: 'Groupes', activity: 'Activité', profile: 'Profil' },
  feed: {
    events: 'Événements', sightseeing: 'Tourisme', sport: 'Sport', partners: 'Partenaires',
    forYou: 'Pour toi', recent: 'Récent', chooseCity: 'Choisir une ville', filters: 'Filtres',
    date: 'DATE', price: 'PRIX', allDates: 'Toutes les dates', today: "Aujourd'hui", weekend: 'Week-end',
    thisWeek: 'Cette semaine', thisMonth: 'Ce mois-ci', anyPrice: 'Tout prix', free: 'Gratuit',
    newContent: 'Nouveau contenu disponible — appuie pour charger',
    allCaughtUp: 'Tu es à jour ✨', pullRefresh: 'Tire vers le bas pour rafraîchir',
    loadingMore: 'Chargement…', eventsNear: 'Événements près de', sightseeingNear: 'Tourisme à',
    sportNear: 'Sport à', sortedByDate: 'Trié par date', featuredPartners: 'Partenaires vedettes',
    sponsoredPlacements: 'Emplacements sponsorisés', findingEvents: 'Recherche d\'événements à',
    findingMore: 'Plus à', loading: 'Chargement…',
    basedOnInterests: 'Basé sur tes intérêts', moreLove: "Tu vas adorer",
    curatedForYou: 'Sélectionné pour toi', wantFeatured: 'Envie d\'être mis en avant ?',
    contactUs: 'Contact : partners@nova-app.com · À partir de 300€/mois', backToTop: 'Retour en haut',
  },
  profile: {
    events: 'Événements', going: "J'y vais", following: 'Abonnements', liked: "J'aime",
    saved: 'Enregistré', calendar: 'Calendrier', badges: 'Badges',
    editProfile: 'Modifier le profil', findFriends: 'Trouver des amis', signInSync: 'Connecte-toi pour synchroniser',
    feedPreferences: 'Préférences du fil', feedPreferencesDesc: "Ajuste ton algorithme IA",
    noLikedPosts: 'Aucun post aimé', noLikedHint: 'Appuie ⭐ sur un post',
    noSavedPosts: 'Rien enregistré', noSavedHint: 'Appuie 🔖 sur un post',
    noUpcomingEvents: 'Aucun événement à venir', saveEventsHint: 'Enregistre des événements ou marque "J\'y vais"',
    badgesEarned: 'OBTENUS', nextBadge: 'Prochain :', seeAll: 'Tout voir →',
    dataOnDevice: 'Tes données sont uniquement sur cet appareil',
    dataSyncHint: 'Connecte-toi pour synchroniser sur tous tes appareils.',
    earned: 'Obtenu', badges_title: 'Badges',
    today: "Aujourd'hui", tomorrow: 'Demain', daysAway: 'j', going_label: '✓ J\'y vais',
  },
  settings: {
    title: 'Paramètres', changePhoto: 'Changer la photo de profil', requestVerification: 'Demander une vérification',
    locationOn: 'Localisation', locationOff: 'Activer la localisation', privacy: 'Confidentialité',
    notificationSettings: 'Notifications', clearData: 'Effacer toutes les données', signOut: 'Se déconnecter',
    language: 'Langue', selectLanguage: 'Sélectionner la langue', languageDesc: "Langue de l'app",
    clearConfirmTitle: 'Effacer toutes les données ?',
    clearConfirmDesc: 'Supprime les préférences, likes et données locales. Irréversible.',
    clearCancel: 'Annuler', clearButton: 'Effacer',
    comingSoon: 'Bientôt', privacyMsg: 'Données chiffrées AES-256',
    verificationSent: 'Demande envoyée ✓', locationEnabled: 'Localisation activée',
    locationDisabled: 'Localisation désactivée',
  },
  notifications: {
    title: 'Activité', markAllRead: 'Tout marquer comme lu', new_section: 'Nouveau', earlier: 'Plus tôt',
    empty: 'Aucune activité', emptyHint: 'Les mises à jour d\'événements apparaîtront ici',
    enablePush: 'Reste informé 🔔',
    enablePushDesc: 'Active les notifications pour recevoir des alertes sur les nouveaux événements.',
    enableButton: 'Activer les notifications',
  },
  common: {
    save: 'Enregistrer', saved: 'Enregistré', follow: 'Suivre', following: 'Abonné',
    more: 'plus', cancel: 'Annuler', clear: 'Effacer',
    getTickets: 'Billets & infos', aiDiscovered: 'Découvert par IA',
    partner: 'PARTENAIRE', sponsored: 'Sponsorisé', event: 'ÉVÉNEMENT',
    goingLabel: 'Tu y vas ! 🎉', today: "Aujourd'hui !", tomorrow: 'Demain !', daysAway: 'j',
    searchUsers: 'Chercher un utilisateur…', noUsersFound: 'Aucun utilisateur', yourStory: 'Ta story',
  },
  categories: {
    travel: 'Voyages', food: 'Cuisine', fashion: 'Mode', sports: 'Sports', art: 'Art',
    tech: 'Tech', fitness: 'Fitness', music: 'Musique', pets: 'Animaux', lifestyle: 'Lifestyle',
    events: 'Événements', sightseeing: 'Tourisme',
    shops: 'Boutiques', venues: 'Salles', community: 'Communauté',
  },
};

const it: AppTranslations = {
  nav: { discover: 'Scopri', explore: 'Esplora', groups: 'Gruppi', activity: 'Attività', profile: 'Profilo' },
  feed: {
    events: 'Eventi', sightseeing: 'Turismo', sport: 'Sport', partners: 'Partner',
    forYou: 'Per te', recent: 'Recenti', chooseCity: 'Scegli città', filters: 'Filtri',
    date: 'DATA', price: 'PREZZO', allDates: 'Tutte le date', today: 'Oggi', weekend: 'Weekend',
    thisWeek: 'Questa settimana', thisMonth: 'Questo mese', anyPrice: 'Qualsiasi prezzo', free: 'Gratis',
    newContent: 'Nuovo contenuto disponibile — tocca per caricare',
    allCaughtUp: 'Sei aggiornato ✨', pullRefresh: 'Trascina verso il basso per aggiornare',
    loadingMore: 'Caricamento…', eventsNear: 'Eventi vicino a', sightseeingNear: 'Turismo a',
    sportNear: 'Sport a', sortedByDate: 'Ordinato per data', featuredPartners: 'Partner in evidenza',
    sponsoredPlacements: 'Spazi sponsorizzati', findingEvents: 'Ricerca eventi a',
    findingMore: 'Altro a', loading: 'Caricamento…',
    basedOnInterests: 'Basato sui tuoi interessi', moreLove: 'Altro che ti piacerà',
    curatedForYou: 'Selezionato per te', wantFeatured: 'Vuoi essere in evidenza?',
    contactUs: 'Contattaci: partners@nova-app.com · Da €300/mese', backToTop: 'Torna su',
  },
  profile: {
    events: 'Eventi', going: 'Ci vado', following: 'Seguiti', liked: 'Mi piace',
    saved: 'Salvato', calendar: 'Calendario', badges: 'Badge',
    editProfile: 'Modifica profilo', findFriends: 'Trova amici', signInSync: 'Accedi per sincronizzare',
    feedPreferences: 'Preferenze feed', feedPreferencesDesc: "Regola l'algoritmo IA",
    noLikedPosts: 'Nessun post piaciuto', noLikedHint: 'Tocca ⭐ su un post',
    noSavedPosts: 'Niente salvato', noSavedHint: 'Tocca 🔖 su un post',
    noUpcomingEvents: 'Nessun evento imminente', saveEventsHint: 'Salva eventi o segna "Ci vado"',
    badgesEarned: 'OTTENUTI', nextBadge: 'Prossimo:', seeAll: 'Vedi tutti →',
    dataOnDevice: 'I tuoi dati sono solo su questo dispositivo',
    dataSyncHint: 'Accedi per sincronizzare tra tutti i dispositivi.',
    earned: 'Ottenuto', badges_title: 'Badge',
    today: 'Oggi', tomorrow: 'Domani', daysAway: 'g', going_label: '✓ Ci vado',
  },
  settings: {
    title: 'Impostazioni', changePhoto: 'Cambia foto profilo', requestVerification: 'Richiedi verifica',
    locationOn: 'Posizione', locationOff: 'Attiva posizione', privacy: 'Privacy e sicurezza',
    notificationSettings: 'Notifiche', clearData: 'Cancella tutti i dati', signOut: 'Esci',
    language: 'Lingua', selectLanguage: 'Seleziona lingua', languageDesc: "Lingua dell'app",
    clearConfirmTitle: 'Cancellare tutti i dati?',
    clearConfirmDesc: 'Elimina preferenze, mi piace e dati locali. Non reversibile.',
    clearCancel: 'Annulla', clearButton: 'Cancella',
    comingSoon: 'Prossimamente', privacyMsg: 'Dati cifrati con AES-256',
    verificationSent: 'Richiesta inviata ✓', locationEnabled: 'Posizione attivata',
    locationDisabled: 'Posizione disattivata',
  },
  notifications: {
    title: 'Attività', markAllRead: 'Segna tutto come letto', new_section: 'Nuovo', earlier: 'Prima',
    empty: 'Nessuna attività', emptyHint: 'Gli aggiornamenti degli eventi appariranno qui',
    enablePush: 'Rimani aggiornato 🔔',
    enablePushDesc: 'Attiva le notifiche push per ricevere avvisi su nuovi eventi.',
    enableButton: 'Attiva notifiche',
  },
  common: {
    save: 'Salva', saved: 'Salvato', follow: 'Segui', following: 'Seguito',
    more: 'altro', cancel: 'Annulla', clear: 'Cancella',
    getTickets: 'Biglietti & info', aiDiscovered: 'Scoperto da IA',
    partner: 'PARTNER', sponsored: 'Sponsorizzato', event: 'EVENTO',
    goingLabel: 'Ci vai! 🎉', today: 'Oggi!', tomorrow: 'Domani!', daysAway: 'g',
    searchUsers: 'Cerca per username…', noUsersFound: 'Nessun utente', yourStory: 'La tua storia',
  },
  categories: {
    travel: 'Viaggi', food: 'Cibo', fashion: 'Moda', sports: 'Sport', art: 'Arte',
    tech: 'Tecnologia', fitness: 'Fitness', music: 'Musica', pets: 'Animali', lifestyle: 'Lifestyle',
    events: 'Eventi', sightseeing: 'Turismo',
    shops: 'Negozi', venues: 'Location', community: 'Comunità',
  },
};

const pt: AppTranslations = {
  nav: { discover: 'Descobrir', explore: 'Explorar', groups: 'Grupos', activity: 'Atividade', profile: 'Perfil' },
  feed: {
    events: 'Eventos', sightseeing: 'Turismo', sport: 'Esporte', partners: 'Parceiros',
    forYou: 'Para você', recent: 'Recente', chooseCity: 'Escolher cidade', filters: 'Filtros',
    date: 'DATA', price: 'PREÇO', allDates: 'Todas as datas', today: 'Hoje', weekend: 'Fim de semana',
    thisWeek: 'Esta semana', thisMonth: 'Este mês', anyPrice: 'Qualquer preço', free: 'Grátis',
    newContent: 'Novo conteúdo disponível — toque para carregar',
    allCaughtUp: 'Você está em dia ✨', pullRefresh: 'Puxe para atualizar',
    loadingMore: 'Carregando mais…', eventsNear: 'Eventos perto de', sightseeingNear: 'Turismo em',
    sportNear: 'Esporte em', sortedByDate: 'Ordenado por data', featuredPartners: 'Parceiros em destaque',
    sponsoredPlacements: 'Espaços patrocinados', findingEvents: 'Buscando eventos em',
    findingMore: 'Mais em', loading: 'Carregando…',
    basedOnInterests: 'Baseado nos seus interesses', moreLove: 'Mais que você vai adorar',
    curatedForYou: 'Selecionado para você', wantFeatured: 'Quer aparecer aqui?',
    contactUs: 'Contate: partners@nova-app.com · A partir de €300/mês', backToTop: 'Voltar ao topo',
  },
  profile: {
    events: 'Eventos', going: 'Vou', following: 'Seguindo', liked: 'Curtidos',
    saved: 'Salvos', calendar: 'Calendário', badges: 'Conquistas',
    editProfile: 'Editar perfil', findFriends: 'Encontrar amigos', signInSync: 'Entre para sincronizar',
    feedPreferences: 'Preferências do feed', feedPreferencesDesc: 'Ajuste seu algoritmo de IA',
    noLikedPosts: 'Sem posts curtidos ainda', noLikedHint: 'Toque ⭐ em qualquer post',
    noSavedPosts: 'Nada salvo ainda', noSavedHint: 'Toque 🔖 em qualquer post',
    noUpcomingEvents: 'Sem eventos próximos', saveEventsHint: 'Salve eventos ou marque "Vou"',
    badgesEarned: 'CONQUISTADAS', nextBadge: 'Próxima:', seeAll: 'Ver todas →',
    dataOnDevice: 'Seus dados estão só neste dispositivo',
    dataSyncHint: 'Entre para sincronizar entre dispositivos.',
    earned: 'Conquistada', badges_title: 'Conquistas',
    today: 'Hoje', tomorrow: 'Amanhã', daysAway: 'd', going_label: '✓ Vou',
  },
  settings: {
    title: 'Configurações', changePhoto: 'Alterar foto do perfil', requestVerification: 'Solicitar verificação',
    locationOn: 'Localização', locationOff: 'Ativar localização', privacy: 'Privacidade e segurança',
    notificationSettings: 'Notificações', clearData: 'Apagar todos os dados', signOut: 'Sair',
    language: 'Idioma', selectLanguage: 'Selecionar idioma', languageDesc: 'Idioma do app',
    clearConfirmTitle: 'Apagar todos os dados?',
    clearConfirmDesc: 'Apaga preferências, curtidas e dados locais. Irreversível.',
    clearCancel: 'Cancelar', clearButton: 'Apagar',
    comingSoon: 'Em breve', privacyMsg: 'Dados criptografados com AES-256',
    verificationSent: 'Solicitação enviada ✓', locationEnabled: 'Localização ativada',
    locationDisabled: 'Localização desativada',
  },
  notifications: {
    title: 'Atividade', markAllRead: 'Marcar tudo como lido', new_section: 'Novo', earlier: 'Mais cedo',
    empty: 'Sem atividade ainda', emptyHint: 'Atualizações de eventos aparecerão aqui',
    enablePush: 'Fique por dentro 🔔',
    enablePushDesc: 'Ative notificações push para receber alertas de novos eventos.',
    enableButton: 'Ativar notificações',
  },
  common: {
    save: 'Salvar', saved: 'Salvo', follow: 'Seguir', following: 'Seguindo',
    more: 'mais', cancel: 'Cancelar', clear: 'Apagar',
    getTickets: 'Ingressos & info', aiDiscovered: 'Descoberto pela IA',
    partner: 'PARCEIRO', sponsored: 'Patrocinado', event: 'EVENTO',
    goingLabel: 'Você vai! 🎉', today: 'Hoje!', tomorrow: 'Amanhã!', daysAway: 'd',
    searchUsers: 'Buscar por usuário…', noUsersFound: 'Nenhum usuário', yourStory: 'Sua história',
  },
  categories: {
    travel: 'Viagens', food: 'Comida', fashion: 'Moda', sports: 'Esportes', art: 'Arte',
    tech: 'Tecnologia', fitness: 'Fitness', music: 'Música', pets: 'Pets', lifestyle: 'Estilo de vida',
    events: 'Eventos', sightseeing: 'Turismo',
    shops: 'Lojas', venues: 'Locais', community: 'Comunidade',
  },
};

const nl: AppTranslations = {
  nav: { discover: 'Ontdekken', explore: 'Verkennen', groups: 'Groepen', activity: 'Activiteit', profile: 'Profiel' },
  feed: {
    events: 'Evenementen', sightseeing: 'Bezienswaardigheden', sport: 'Sport', partners: 'Partners',
    forYou: 'Voor jou', recent: 'Recent', chooseCity: 'Kies stad', filters: 'Filters',
    date: 'DATUM', price: 'PRIJS', allDates: 'Alle datums', today: 'Vandaag', weekend: 'Weekend',
    thisWeek: 'Deze week', thisMonth: 'Deze maand', anyPrice: 'Elke prijs', free: 'Gratis',
    newContent: 'Nieuwe content beschikbaar — tik om te laden',
    allCaughtUp: 'Je bent bijgewerkt ✨', pullRefresh: 'Trek omlaag om te vernieuwen',
    loadingMore: 'Meer laden…', eventsNear: 'Evenementen bij', sightseeingNear: 'Bezienswaardigheden in',
    sportNear: 'Sport in', sortedByDate: 'Gesorteerd op datum', featuredPartners: 'Uitgelichte partners',
    sponsoredPlacements: 'Gesponsorde plaatsingen', findingEvents: 'Evenementen zoeken in',
    findingMore: 'Meer in', loading: 'Laden…',
    basedOnInterests: 'Op basis van je interesses', moreLove: 'Meer wat je leuk vindt',
    curatedForYou: 'Geselecteerd voor jou', wantFeatured: 'Wil je hier verschijnen?',
    contactUs: 'Contact: partners@nova-app.com · Vanaf €300/maand', backToTop: 'Terug naar boven',
  },
  profile: {
    events: 'Evenementen', going: 'Ga ik', following: 'Volgend', liked: 'Vind ik leuk',
    saved: 'Opgeslagen', calendar: 'Kalender', badges: 'Badges',
    editProfile: 'Profiel bewerken', findFriends: 'Vrienden zoeken', signInSync: 'Log in om te synchroniseren',
    feedPreferences: 'Feedvoorkeuren', feedPreferencesDesc: 'Stel je AI-algoritme in',
    noLikedPosts: 'Nog geen gelikte berichten', noLikedHint: 'Tik ⭐ op een bericht',
    noSavedPosts: 'Nog niets opgeslagen', noSavedHint: 'Tik 🔖 op een bericht',
    noUpcomingEvents: 'Geen aankomende evenementen', saveEventsHint: 'Sla evenementen op of markeer "Ga ik"',
    badgesEarned: 'VERDIEND', nextBadge: 'Volgende:', seeAll: 'Alles zien →',
    dataOnDevice: 'Je gegevens staan alleen op dit apparaat',
    dataSyncHint: 'Log in om te synchroniseren tussen apparaten.',
    earned: 'Verdiend', badges_title: 'Badges',
    today: 'Vandaag', tomorrow: 'Morgen', daysAway: 'd', going_label: '✓ Ga ik',
  },
  settings: {
    title: 'Instellingen', changePhoto: 'Profielfoto wijzigen', requestVerification: 'Verificatie aanvragen',
    locationOn: 'Locatie', locationOff: 'Locatie inschakelen', privacy: 'Privacy & beveiliging',
    notificationSettings: 'Meldingen', clearData: 'Alle gegevens wissen', signOut: 'Uitloggen',
    language: 'Taal', selectLanguage: 'Taal selecteren', languageDesc: 'App-taal',
    clearConfirmTitle: 'Alle gegevens wissen?',
    clearConfirmDesc: 'Verwijdert voorkeuren, likes en lokale gegevens. Onherstelbaar.',
    clearCancel: 'Annuleren', clearButton: 'Wissen',
    comingSoon: 'Binnenkort', privacyMsg: 'Gegevens versleuteld met AES-256',
    verificationSent: 'Aanvraag ingediend ✓', locationEnabled: 'Locatie ingeschakeld',
    locationDisabled: 'Locatie uitgeschakeld',
  },
  notifications: {
    title: 'Activiteit', markAllRead: 'Alles als gelezen markeren', new_section: 'Nieuw', earlier: 'Eerder',
    empty: 'Nog geen activiteit', emptyHint: 'Evenementupdates verschijnen hier',
    enablePush: 'Blijf op de hoogte 🔔',
    enablePushDesc: 'Schakel pushmeldingen in voor nieuwe evenementalerts.',
    enableButton: 'Meldingen inschakelen',
  },
  common: {
    save: 'Opslaan', saved: 'Opgeslagen', follow: 'Volgen', following: 'Volgend',
    more: 'meer', cancel: 'Annuleren', clear: 'Wissen',
    getTickets: 'Tickets & info', aiDiscovered: 'AI Ontdekt',
    partner: 'PARTNER', sponsored: 'Gesponsord', event: 'EVENEMENT',
    goingLabel: 'Je gaat! 🎉', today: 'Vandaag!', tomorrow: 'Morgen!', daysAway: 'd',
    searchUsers: 'Zoeken op gebruikersnaam…', noUsersFound: 'Geen gebruikers', yourStory: 'Jouw verhaal',
  },
  categories: {
    travel: 'Reizen', food: 'Eten', fashion: 'Mode', sports: 'Sport', art: 'Kunst',
    tech: 'Tech', fitness: 'Fitness', music: 'Muziek', pets: 'Huisdieren', lifestyle: 'Lifestyle',
    events: 'Evenementen', sightseeing: 'Bezienswaardigheden',
    shops: 'Winkels', venues: 'Locaties', community: 'Gemeenschap',
  },
};

const ja: AppTranslations = {
  nav: { discover: '発見', explore: '探索', groups: 'グループ', activity: '通知', profile: 'プロフィール' },
  feed: {
    events: 'イベント', sightseeing: '観光', sport: 'スポーツ', partners: 'パートナー',
    forYou: 'あなたへ', recent: '最新', chooseCity: '都市を選ぶ', filters: 'フィルター',
    date: '日付', price: '価格', allDates: 'すべての日付', today: '今日', weekend: '週末',
    thisWeek: '今週', thisMonth: '今月', anyPrice: '全価格帯', free: '無料',
    newContent: '新しいコンテンツ — タップして読み込む',
    allCaughtUp: '最新の情報です ✨', pullRefresh: '下に引いて更新',
    loadingMore: 'さらに読み込み中…', eventsNear: 'イベント in', sightseeingNear: '観光 in',
    sportNear: 'スポーツ in', sortedByDate: '日付順', featuredPartners: '注目パートナー',
    sponsoredPlacements: 'スポンサー広告', findingEvents: 'イベント検索中:',
    findingMore: 'さらに探す:', loading: '読み込み中…',
    basedOnInterests: 'あなたの興味に基づく', moreLove: 'あなたが好きなもの',
    curatedForYou: 'あなたのために厳選', wantFeatured: 'ここに掲載したいですか？',
    contactUs: 'お問い合わせ: partners@nova-app.com', backToTop: 'トップへ',
  },
  profile: {
    events: 'イベント', going: '参加予定', following: 'フォロー中', liked: 'いいね',
    saved: 'saved', calendar: 'カレンダー', badges: 'バッジ',
    editProfile: 'プロフィール編集', findFriends: '友達を探す', signInSync: 'サインインして同期',
    feedPreferences: 'フィード設定', feedPreferencesDesc: 'AIアルゴリズムを調整',
    noLikedPosts: 'いいねしたものはありません', noLikedHint: '⭐ をタップしていいねしよう',
    noSavedPosts: '保存済みなし', noSavedHint: '🔖 をタップして保存しよう',
    noUpcomingEvents: '予定イベントなし', saveEventsHint: 'イベントを保存または「参加予定」にしよう',
    badgesEarned: '獲得済み', nextBadge: '次:', seeAll: 'すべて見る →',
    dataOnDevice: 'データはこのデバイスのみ',
    dataSyncHint: 'サインインして全デバイスで同期しよう。',
    earned: '獲得', badges_title: 'バッジ',
    today: '今日', tomorrow: '明日', daysAway: '日後', going_label: '✓ 参加予定',
  },
  settings: {
    title: '設定', changePhoto: 'プロフィール写真を変更', requestVerification: '認証を申請',
    locationOn: '位置情報', locationOff: '位置情報を有効にする', privacy: 'プライバシー',
    notificationSettings: '通知設定', clearData: 'データをすべて削除', signOut: 'サインアウト',
    language: '言語', selectLanguage: '言語を選択', languageDesc: 'アプリの言語',
    clearConfirmTitle: 'すべてのデータを削除しますか？',
    clearConfirmDesc: '設定、いいね、保存データが削除されます。元に戻せません。',
    clearCancel: 'キャンセル', clearButton: '削除',
    comingSoon: '近日公開', privacyMsg: 'データはAES-256で暗号化されています',
    verificationSent: '申請完了 ✓', locationEnabled: '位置情報有効',
    locationDisabled: '位置情報無効',
  },
  notifications: {
    title: 'アクティビティ', markAllRead: 'すべて既読にする', new_section: '新着', earlier: '以前',
    empty: 'アクティビティなし', emptyHint: 'イベントの更新がここに表示されます',
    enablePush: '最新情報を受け取る 🔔',
    enablePushDesc: 'プッシュ通知を有効にして新しいイベントを受け取ろう。',
    enableButton: '通知を有効にする',
  },
  common: {
    save: '保存', saved: '保存済み', follow: 'フォロー', following: 'フォロー中',
    more: 'もっと見る', cancel: 'キャンセル', clear: '削除',
    getTickets: 'チケット＆情報', aiDiscovered: 'AI発見',
    partner: 'パートナー', sponsored: '広告', event: 'イベント',
    goingLabel: '参加します！ 🎉', today: '今日！', tomorrow: '明日！', daysAway: '日後',
    searchUsers: 'ユーザー名で検索…', noUsersFound: 'ユーザーが見つかりません', yourStory: 'あなたのストーリー',
  },
  categories: {
    travel: '旅行', food: 'グルメ', fashion: 'ファッション', sports: 'スポーツ', art: 'アート',
    tech: 'テック', fitness: 'フィットネス', music: '音楽', pets: 'ペット', lifestyle: 'ライフスタイル',
    events: 'イベント', sightseeing: '観光',
    shops: 'ショップ', venues: '会場', community: 'コミュニティ',
  },
};

export const TRANSLATIONS: Record<Locale, AppTranslations> = { en, de, es, fr, it, pt, nl, ja };
