# Instalacja aplikacji i powiadomienia Web Push

## Co jest gotowe w repozytorium

- Manifest, ikony PNG i service worker: instalacja jako PWA przez przeglądarkę, ekran braku połączenia, odbiór push i otwieranie dnia z powiadomienia.
- Menu **Powiadomienia** widoczne wyłącznie w trybie zainstalowanej aplikacji. Każda z trzech opcji jest domyślnie wyłączona.
- Własna służba (wszystkie kategorie), Msza bez zapisanych osób, nabożeństwo bez zapisanych osób. Wszystkie około 30 minut przed rozpoczęciem.
- Ustawienia urządzenia przypisują przypomnienia do wybranego w tym menu ministranta. Zmiana imienia w grafiku nie zmienia odbiorcy w tle.
- SQL korzysta z `effective_attendees`: uwzględnia stałe dyżury, ich rytmy oraz zgłoszone nieobecności. „Bez osób” oznacza brak deklaracji, nie faktyczny brak ludzi w kościele.
- Prywatne subskrypcje i historia wysyłek. Losowy token urządzenia w localStorage służy wyłącznie do zarządzania jego subskrypcją. Wybór ministranta, tak jak reszta aplikacji, nie jest uwierzytelnieniem osoby.

## Wdrożenie (wymagane przed pierwszym powiadomieniem)

1. Opublikuj stronę przez **HTTPS**. Hostuj `manifest.webmanifest`, `sw.js`, `offline.html` i ikony pod ścieżkami z katalogu `public`. Ustaw `Cache-Control: no-cache` dla `/sw.js` i `/index.html`. Projekt jest skonfigurowany do hostowania w głównym katalogu domeny.
2. Po wcześniejszych migracjach wykonaj `supabase/migrations/202609150008_push_notifications.sql`.
3. Wygeneruj klucze VAPID jednokrotnie: `npx web-push@3.6.7 generate-vapid-keys --json`. Zachowaj prywatny klucz w bezpiecznym miejscu; nie zapisuj go w Git ani w zmiennych `VITE_*`.
4. Ustaw publiczny klucz jako **VITE_VAPID_PUBLIC_KEY** w środowisku buildu strony. Przebuduj i opublikuj frontend.
5. Ustaw sekrety funkcji Supabase:
   - `VAPID_PUBLIC_KEY`: ten sam publiczny klucz,
   - `VAPID_PRIVATE_KEY`: prywatny klucz,
   - `VAPID_SUBJECT`: rzeczywisty kontakt administratora, np. `mailto:kontakt@twoja-parafia.pl`,
   - `PUSH_CRON_SECRET`: losowy sekret, co najmniej 32 bajty (np. `openssl rand -hex 32`).
   Standardowe `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` udostępnia środowisko Edge Functions. Żaden sekret nie trafia do aplikacji przeglądarkowej.
6. Wdróż funkcję: `supabase functions deploy send-notifications --no-verify-jwt`. Funkcja samodzielnie weryfikuje `x-cron-secret`; wyłączenie wbudowanego JWT jest wymagane tylko dla tego endpointu. Nie wywołuj jej z frontendu.
7. W Supabase Vault utwórz `push_function_url` (pełny URL wdrożonej funkcji) i `push_cron_secret` (wartość identyczna jak `PUSH_CRON_SECRET`). Uruchom `supabase/setup_push_cron.sql`. Ponowne uruchomienie aktualizuje zadanie o tej samej nazwie.
8. Zainstaluj stronę na telefonie, uruchom ją z ikony, otwórz **Powiadomienia**, wybierz ministranta i opcje, naciśnij **Zapisz ustawienia**, a następnie udziel zgody systemowej.

## Sprawdzenie na urządzeniu

- Ustaw testowe wydarzenie około 31 minut w przyszłości, zapisz wybranego ministranta i włącz „Moja służba”. Zamknij aplikację. Po minucie powinno nadejść przypomnienie; kliknięcie otwiera właściwy dzień.
- Osobno sprawdź pustą Mszę i puste nabożeństwo, włączając odpowiednie opcje. Puste „Inne” nie wywołuje alertu.
- Dopisz kogoś przed wejściem w okno 30 minut: alert o pustym wydarzeniu nie powinien zostać wysłany.
- Zgłoś nieobecność przy stałym dyżurze: przypomnienie o własnej służbie nie powinno nadejść.
- Sprawdź brak ponownej wysyłki przy kolejnych uruchomieniach zadania oraz wyłączenie wszystkich opcji.
- Sprawdź odmowę zgody, brak internetu, wyłączone powiadomienia w systemie i ponowne otwarcie ustawień.

## Zachowanie i utrzymanie

Cron sprawdza stan co 30 minut. Wysyłki obejmują wydarzenia rozpoczynające się w ciągu kolejnych 30 minut. Nowa subskrypcja w tym oknie może dostać je przy następnym uruchomieniu zadania. Nie wysyłamy przypomnień po rozpoczęciu. Zmiana godziny tworzy nowy termin przypomnienia. Jedna wysyłka jest zapamiętywana dla urządzenia, wydarzenia, godziny i rodzaju alertu. Lease chroni przed równoległymi zadaniami; przejściowe błędy są ponawiane najwyżej trzy razy. Gdy dostawca przyjmie wiadomość, lecz potwierdzenie do bazy się nie powiedzie, ponowienie może ponownie dotrzeć — tag powiadomienia zastępuje poprzednie na urządzeniu, nie daje gwarancji exactly-once.

Wysyłka używa aktualnych deklaracji w momencie pobrania partii. Zapis dokonany tuż później może już nie zatrzymać wiadomości będącej w drodze. TTL kończy się wraz z rozpoczęciem wydarzenia. Subskrypcje wygasłe (HTTP 404/410) są usuwane. Ponowne zapisanie ustawień odświeża subskrypcję. Historia wysyłek jest czyszczona po 7 dniach. Nie cache'ujemy grafiku ani danych Supabase offline.

Kontroluj historię zadania w Supabase Cron oraz odpowiedzi funkcji `{sent,failed}`. Sekret cron pozostaje w Vault. Przy zmianie kluczy VAPID użytkownicy muszą wyłączyć i ponownie włączyć powiadomienia. Dostarczanie zależy od systemu telefonu, połączenia i dostawcy push — nie jest alarmem gwarantującym dokładną minutę.

Na iPhonie/iPadzie Web Push wymaga iOS/iPadOS 16.4+ i aplikacji dodanej do ekranu początkowego. Dokumentacja: [Apple/WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Supabase Cron i Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [web-push](https://github.com/web-push-libs/web-push).
