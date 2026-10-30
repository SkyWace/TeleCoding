/*
 * Navigation spatiale à la télécommande.
 *
 * Tout élément .focusable visible de la zone active peut recevoir le focus.
 * - Gauche/droite restent dans la même rangée (data-row) quand elle existe.
 * - Haut/bas changent de rangée et retrouvent le dernier élément visité.
 * - Les fenêtres (paramètres, menus) ouvrent une nouvelle zone : le focus ne
 *   peut pas en sortir, et revient où il était à la fermeture.
 */
(function (global) {
    'use strict';

    var TC = global.TC = global.TC || {};
    var doc = global.document;

    var scopes = []; // pile de { root, previous, memory }
    var current = null;
    var listeners = [];

    function scope() { return scopes[scopes.length - 1]; }

    function visible(el) {
        return el.offsetParent !== null && !el.disabled && !el.hasAttribute('hidden');
    }

    function candidates() {
        var s = scope();
        if (!s) return [];
        return Array.prototype.filter.call(s.root.querySelectorAll('.focusable'), visible);
    }

    function rect(el) {
        var r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
    }

    function rowOf(el) { return el.getAttribute('data-row') || null; }

    function scrollParent(el, axis) {
        var p = el.parentElement;
        while (p && p !== doc.body) {
            if (p.getAttribute('data-scroll') === axis) return p;
            p = p.parentElement;
        }
        return null;
    }

    /*
     * Défilement par la carte graphique : au lieu de faire défiler le conteneur (scrollTop /
     * scrollLeft, qui redessine toute la zone à chaque image sur une TV), son contenu est
     * enveloppé dans une « glissière » (.slide) qu'on déplace avec transform. Elle a son
     * propre calque : la déplacer ne redessine rien.
     */
    function slideOf(container) {
        var slide = container._slide;
        var ok = slide && slide.parentNode === container && container.children.length === 1;
        if (!ok) {
            var offset = slide && slide.parentNode === container ? slide._offset : 0;
            slide = doc.createElement('div');
            slide.className = 'slide slide-' + container.getAttribute('data-scroll');
            while (container.firstChild) {
                if (container.firstChild === container._slide) container.removeChild(container.firstChild);
                else slide.appendChild(container.firstChild);
            }
            container.appendChild(slide);
            container._slide = slide;
            slide._offset = 0;
            if (offset) setOffset(container, offset, false);
        }
        return slide;
    }

    function offsetOf(container) {
        return container && container._slide ? container._slide._offset || 0 : 0;
    }

    function setOffset(container, value, animate) {
        var slide = slideOf(container);
        var axis = container.getAttribute('data-scroll');
        var size = axis === 'x' ? slide.offsetWidth - container.clientWidth : slide.offsetHeight - container.clientHeight;
        value = Math.max(0, Math.min(Math.max(0, size), Math.round(value)));
        if (value === slide._offset) return;
        slide._offset = value;
        slide.style.transition = animate ? '' : 'none';
        slide.style.transform = axis === 'x' ? 'translate3d(' + -value + 'px,0,0)' : 'translate3d(0,' + -value + 'px,0)';
        if (!animate) { slide.offsetWidth; slide.style.transition = ''; }
    }

    // Position de el dans la glissière (sans le zoom de la carte sélectionnée).
    function positionIn(el, slide) {
        var x = 0, y = 0, p = el;
        while (p && p !== slide) { x += p.offsetLeft; y += p.offsetTop; p = p.offsetParent; }
        return { x: x, y: y };
    }

    function ensureVisible(el) {
        var animate = doc.body.getAttribute('data-anim') !== 'off';
        var track = scrollParent(el, 'x');
        if (track) {
            // Carte par carte : les cartes visibles restent entières.
            var slide = slideOf(track);
            var pad = parseFloat(global.getComputedStyle(track).paddingLeft) || 0;
            var x = positionIn(el, slide).x;
            var left = slide._offset;
            if (x - pad < left) left = x - pad;
            else if (x + el.offsetWidth + pad > left + track.clientWidth) left = x + el.offsetWidth + pad - track.clientWidth;
            setOffset(track, left, animate);
        }
        var pane = scrollParent(el, 'y');
        if (pane) {
            var pslide = slideOf(pane);
            var box = el.closest('[data-scroll-anchor]') || el;
            var by = positionIn(box, pslide).y;
            var top = pslide._offset;
            var margin = 90; // de la place pour le nom affiché sous la carte
            if (by - top < margin) top = by - margin;
            else if (by + box.offsetHeight - top > pane.clientHeight - margin) top = by + box.offsetHeight - pane.clientHeight + margin;
            setOffset(pane, top, animate);
        }
    }

    function set(el) {
        if (!el) return;
        if (current && current !== el) current.classList.remove('focused');
        current = el;
        el.classList.add('focused');
        var s = scope();
        var row = rowOf(el);
        if (s && row) s.memory[row] = el;
        try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
        ensureVisible(el);
        listeners.forEach(function (fn) { fn(el); });
    }

    function inDirection(dir, r, c) {
        switch (dir) {
            case 'left': return c.cx < r.cx - 1 && c.left < r.left;
            case 'right': return c.cx > r.cx + 1 && c.right > r.right;
            case 'up': return c.cy < r.cy - 1 && c.top < r.top;
            case 'down': return c.cy > r.cy + 1 && c.bottom > r.bottom;
        }
        return false;
    }

    function gap(dir, r, c) {
        switch (dir) {
            case 'left': return Math.max(0, r.left - c.right);
            case 'right': return Math.max(0, c.left - r.right);
            case 'up': return Math.max(0, r.top - c.bottom);
            case 'down': return Math.max(0, c.top - r.bottom);
        }
        return Infinity;
    }

    function move(dir) {
        var els = candidates();
        if (!els.length) return false;
        if (!current || els.indexOf(current) < 0) { set(els[0]); return true; }

        var r = rect(current);
        var vertical = dir === 'up' || dir === 'down';
        var row = rowOf(current);
        var pool = els.filter(function (el) { return el !== current && inDirection(dir, r, rect(el)); });

        if (!vertical && row) {
            // Gauche/droite : on reste dans la rangée.
            pool = pool.filter(function (el) { return rowOf(el) === row; });
        }
        if (vertical && row) {
            // Haut/bas : on ignore les éléments de la même rangée.
            pool = pool.filter(function (el) { return rowOf(el) !== row; });
        }
        if (!pool.length) return false;

        var best = null;
        var bestScore = Infinity;
        pool.forEach(function (el) {
            var c = rect(el);
            var off = vertical ? Math.abs(c.cx - r.cx) : Math.abs(c.cy - r.cy);
            var score = gap(dir, r, c) * (vertical ? 4 : 1) + off * (vertical ? 1 : 3);
            if (score < bestScore) { bestScore = score; best = el; }
        });

        if (vertical) {
            var target = rowOf(best);
            var remembered = target && scope().memory[target];
            if (remembered && pool.indexOf(remembered) >= 0) best = remembered;
            else if (target) {
                // Dans la rangée visée, l'élément le plus aligné horizontalement.
                var same = pool.filter(function (el) { return rowOf(el) === target; });
                bestScore = Infinity;
                same.forEach(function (el) {
                    var d = Math.abs(rect(el).cx - r.cx);
                    if (d < bestScore) { bestScore = d; best = el; }
                });
            }
        }
        set(best);
        return true;
    }

    TC.focus = {
        get current() { return current; },
        set: set,
        onChange: function (fn) { listeners.push(fn); },
        move: move,
        offsetOf: offsetOf,
        setOffset: setOffset,
        forget: function (row) { var s = scope(); if (s) delete s.memory[row]; },
        recall: function (row) { var s = scope(); return s ? s.memory[row] : null; },
        // Ouvre une zone de focus (page principale, fenêtre…).
        push: function (root, first) {
            scopes.push({ root: root, previous: current, memory: {} });
            var target = first || candidates()[0];
            if (target) set(target);
        },
        // Ferme la zone courante et rend le focus à l'élément précédent.
        pop: function () {
            var s = scopes.pop();
            if (!s) return;
            if (current) current.classList.remove('focused');
            current = null;
            if (s.previous && doc.contains(s.previous)) set(s.previous);
            else move('down');
        },
        depth: function () { return scopes.length; },
        // Après un nouveau rendu : retrouve un élément équivalent.
        restore: function (selector) {
            var el = selector ? scope().root.querySelector(selector) : null;
            if (el && visible(el)) { set(el); return; }
            if (current && doc.contains(current) && visible(current)) { set(current); return; }
            current = null;
            move('down');
        }
    };
})(this);
