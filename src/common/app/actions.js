/* @flow weak */
import { Observable } from 'rxjs/Observable';
import { onAuth, signInDone, signInFail } from '../auth/actions';

export const APP_ERROR = 'APP_ERROR';
export const APP_ONLINE = 'APP_ONLINE';
export const APP_SET_LOCATION = 'APP_SET_LOCATION';
export const APP_SHOW_MENU = 'APP_SHOW_MENU';
export const APP_START = 'APP_START';
export const APP_STARTED = 'APP_STARTED';
export const APP_STOP = 'APP_STOP';
export const APP_STORAGE_LOADED = 'APP_STORAGE_LOADED';

// For serious app errors to be reported on production.
export const appError = (error: Object) => ({
  type: APP_ERROR,
  payload: { error },
});

export const appOnline = (online: bool) => ({
  type: APP_ONLINE,
  payload: { online },
});

export const appSetLocation = (location: Object) => ({
  type: APP_SET_LOCATION,
  payload: { location },
});

export const appShowMenu = (show: bool) => ({
  type: APP_SHOW_MENU,
  payload: { show },
});

// Called on componentDidMount aka only at the client (browser or native).
export const appStart = () => ({
  type: APP_START,
});

export const appStarted = () => ({
  type: APP_STARTED,
});

export const appStop = () => ({
  type: APP_STOP,
});

export const appStorageLoaded = (state: Object) => ({
  type: APP_STORAGE_LOADED,
  payload: { state },
});

const appStartEpic = (action$, { storageEngine }) =>
  action$.ofType(APP_START)
    // www.learnrxjs.io/operators/transformation/mergemap.html
    .mergeMap(() => Observable.from(storageEngine.load())
      .map(appStorageLoaded)
      // redux-observable.js.org/docs/recipes/Cancellation.html
      .takeUntil(action$.ofType(APP_STOP))
      // redux-observable.js.org/docs/recipes/ErrorHandling.html
      .catch(error => Observable.of(appError(error)))
    )
    .mergeMap(action => Observable.of(action, appStarted()));

const appStartFirebaseEpic = (action$, deps) => {
  const { firebase, firebaseAuth, getState } = deps;

  const appOnlineStream = Observable.create(observer => {
    const onValue = snap => {
      const online = snap.val();
      if (online === getState().app.online) return;
      observer.next(appOnline(online));
    };
    firebase.child('.info/connected').on('value', onValue);
    return () => {
      firebase.child('.info/connected').off('value', onValue);
    };
  });

  // firebase.google.com/docs/reference/js/firebase.auth.Auth#onAuthStateChanged
  const onAuthStream = Observable.create(observer => {
    const unsubscribe = firebaseAuth().onAuthStateChanged(firebaseUser => {
      observer.next(onAuth(firebaseUser));
    });
    return unsubscribe;
  });

  const signInAfterRedirectStream = Observable.create(observer => {
    let unsubscribed = false;
    firebaseAuth().getRedirectResult()
      .then(({ user: firebaseUser }) => {
        if (unsubscribed || !firebaseUser) return;
        observer.next(signInDone(firebaseUser));
      })
      .catch(error => {
        if (unsubscribed) return;
        observer.error(signInFail(error));
      });
    return () => {
      unsubscribed = true;
    };
  });

  const streams = [
    appOnlineStream,
    onAuthStream,
  ];

  if (process.env.IS_BROWSER) {
    streams.push(signInAfterRedirectStream);
  }

  return action$.ofType(APP_STARTED)
    .mergeMap(() => Observable
      .merge(...streams)
      // takeUntil unsubscribes all merged streams on APP_STOP.
      .takeUntil(action$.ofType(APP_STOP))
    );
};

export const epics = [
  appStartEpic,
  appStartFirebaseEpic,
];
