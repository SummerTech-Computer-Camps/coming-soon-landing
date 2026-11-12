window.SummerTech =  {
    nav: {},
    megaMenu: null,
    navCloseTimeout: null,
    navClearTargetTimeout: null,
    navLosePreviewTimeout: null,
    //Same breakpoint as the CSS's mobile menu
    mobileQuery: window.matchMedia("(max-width: 800px)"),
    megaMenuTabs: [],
    animate: true,
    tabList: [],
    events: {
        "DOMContentLoaded": () => {

            if(typeof AOS == "object" && SummerTech.animate) {
                AOS.init({"once": true, "duration": 1000});
            }

            SummerTech.nav.init();
        },
        "keydown": (event) => {
            if(event.key === "Escape") {

                //Hand focus back to the open menu's top level link. There isn't one when no desktop menu has been opened.
                let navLink = document.querySelector(".mm-tll[data-id='" + document.body.dataset.navTarget + "']");
                if(navLink) {
                    navLink.focus();
                }
                SummerTech.nav.queueClose();

            }
            if(event.key === "Tab") {
                //Use the menu's own tab order whether or not it's open yet, so Tab goes from a top level link into its sub
                //links. Desktop only: #mega-menu-mini is hidden on mobile, which uses the plain DOM order.
                if(getComputedStyle(document.getElementById("mega-menu-mini")).display !== "none") {

                    let currentFocus = document.activeElement;
                    if(typeof currentFocus.dataset.tabIndex != "undefined") {
                        let tabIndex = parseInt(currentFocus.dataset.tabIndex) || 0;

                        let nextTabIndex = event.shiftKey ? tabIndex - 1 : tabIndex + 1;
                        let nextFocus = document.querySelector("[data-tab-index='" + nextTabIndex + "']");

                        //Shift-tab off the first top level link has no nextFocus and is left to the browser, which goes back to the logo
                        if(nextFocus) {
                            event.preventDefault();

                            //If we're shift-tabbing, the previous focus element might be a button or card link inside the previous tab
                            //which would mean it wouldn't be visible and for that reason would not be focusable. We do
                            //a little bit of stanky DOM traversal to find the correct sub-target and set it on the body
                            //so that the button in question is visible on screen/in the right castle.
                            if(nextFocus.parentElement.tagName == "P" || nextFocus.classList.contains("mm-card-link")) {
                                let p = nextFocus;
                                for(let i = 0; i < 10; i++) {
                                    p = p.parentElement;
                                    if(typeof p.dataset.subTarget != "undefined") {
                                        document.body.dataset.subTarget = p.dataset.subTarget;
                                        break;
                                    }
                                }
                            }

                            //Same idea for the mini menu, which only shows the sub links of the previewed parent. Point the preview
                            //at nextFocus's parent before focusing, or crossing into another parent's links lands on a hidden one.
                            //Top level and sub links carry the parent id themselves, card links go through their sub link.
                            let previewSource = typeof nextFocus.dataset.id != "undefined" ? nextFocus : document.querySelector("#mega-menu-mini [data-menu-id='" + document.body.dataset.subTarget + "']");
                            if(previewSource) {
                                SummerTech.nav.previewSubNav(previewSource);

                                //Card links are inside #mega-menu, which is closed and inert if we're shift-tabbing back from a top
                                //level link, so reopen it on their sub link first
                                if(SummerTech.megaMenu.contains(nextFocus)) {
                                    SummerTech.nav.open(previewSource);
                                }
                            }
                            nextFocus.focus();
                        } else if(!event.shiftKey) {
                            //Past the last menu item. The browser would go to whichever menu links are still visible further
                            //down the header, so skip to the rest of the page instead.
                            if(SummerTech.nav.focusAfterMasthead()) {
                                event.preventDefault();
                            }
                            SummerTech.nav.queueClose();
                            SummerTech.nav.queueLosePreview();
                        }
                        // console.log(tabIndex, nextTabIndex, nextFocus);
                    }
                }
            }
        }
    },
    init: () => {
        for (var event in SummerTech.events) { 
            window.addEventListener(event, SummerTech.events[event]);
        }
    }
};



SummerTech.nav = {
    canOpen: false,
    controlScrollClass: function() {
        if(window.scrollY > 0) {
            document.body.classList.add("scrolled");
        } else {
            document.body.classList.remove("scrolled");
        }
    },
    open: (link) => {


        if(link.dataset.hasChildren === 'false') {
            //Keep top-level preview/highlight behavior, but ensure any previously open panel is closed.
            document.body.dataset.navTarget = link.dataset.id;
            SummerTech.nav.close();
            return;
        }


        //Desktop menu only. The mobile one is opened with the menu button, see setMobileOpen().
        if(!SummerTech.nav.canOpen || SummerTech.mobileQuery.matches) {
            return;
        }

        if(!SummerTech.megaMenuTabs.includes(link.dataset.id)) {

            SummerTech.nav.queueClose();
            return;
        }
        SummerTech.nav.cancelClose();

        let menuRects = SummerTech.megaMenu.getClientRects();
        let linkRects = link.getClientRects();

        let linkCenter = linkRects[0].left + linkRects[0].width/2;

        SummerTech.megaMenu.style.left = Math.min(
            Math.max(0,
                (linkCenter - menuRects[0].width/2) /*+ ((linkCenter < window.innerWidth/2) ? menuRects[0].width/4 : -menuRects[0].width/4)*/
            ),
            window.innerWidth - menuRects[0].width

        )+ "px";

        SummerTech.megaMenu.style.height=SummerTech.megaMenu.querySelector(`[data-sub-target="${document.body.dataset.subTarget}"]`).offsetHeight + "px"

        document.body.dataset.navOpen = "true";
        SummerTech.megaMenu.querySelector(".mm-container").inert = false;
        document.body.dataset.navTarget = link.dataset.id;
        //subTarget is set by subFocus() before it calls this

        if(SummerTech.navCloseTimeout) {
            clearTimeout(SummerTech.navCloseTimeout);
        }
    },
    close: () => {
        document.body.dataset.navOpen = "false";
        SummerTech.megaMenu.style.height = "0px";
       /* document.body.dataset.previewSubTarget = "";*/
        SummerTech.nav.hideQuatCards();

        //Fallback in case the height transition doesn't fire (e.g. already at 0px).
        clearTimeout(SummerTech.navClearTargetTimeout);
        SummerTech.navClearTargetTimeout = setTimeout(() => {
            if(document.body.dataset.navOpen !== "true") {
                document.body.dataset.navTarget = "null";
            }
        }, 550);

        //Stop Tab from landing on links inside the closing menu. Only the contents are inert, so the mouse can
        //still re-enter #mega-menu and reopen it. Skipped for the mobile menu, which never sets a nav target.
        if(document.body.dataset.navTarget != "null") {
            SummerTech.megaMenu.querySelector(".mm-container").inert = true;
        }
    },
    showQuatCard: (cardId, y) => {

        
        if(!cardId || y === undefined) {
            SummerTech.nav.hideQuatCards();
            return;
        }

        let menu = document.querySelector(".side-menu");
        let menuRect = document.querySelector(".mm-container").getBoundingClientRect();

        document.querySelectorAll(".side-menu .quat-card").forEach(card => {
            const isActive = card.dataset.cardId === cardId;
            card.classList.toggle("show", isActive);
            if(isActive) {
                const activeCardRect = card.getBoundingClientRect();
                const desiredTop = y - menuRect.top - (activeCardRect.height / 2);
                menu.style.top = Math.max(0, desiredTop) + "px";
            }
        });
    },
    hideQuatCards: () => {
        document.querySelectorAll(".side-menu .quat-card").forEach(card => {
            card.classList.remove("show");
        });
    },
    //Puts the menu back to its closed, page load state when the window crosses the mobile/desktop breakpoint
    resetForBreakpoint: () => {
        let body = document.body;

        //Snap to the new layout rather than animating from the old one. Otherwise the full height mobile panel shrinks
        //on screen on desktop, and slides across from its desktop position on mobile.
        body.dataset.navSwitching = "true";

        clearTimeout(SummerTech.navCloseTimeout);
        clearTimeout(SummerTech.navLosePreviewTimeout);

        SummerTech.nav.setMobileOpen(false);
        body.dataset.navOpen = "false";
        //Normally cleared once the desktop menu finishes collapsing, which doesn't happen when it's snapped shut or on mobile
        body.dataset.navTarget = "null";
        body.dataset.previewSubTarget = "";
        delete body.dataset.subTarget;
        //The cards are hidden now that there's no sub target, and the mobile menu needs to be clickable
        SummerTech.megaMenu.querySelector(".mm-container").inert = false;

        //Apply all of that with transitions off before turning them back on
        void SummerTech.megaMenu.offsetHeight;
        delete body.dataset.navSwitching;
    },
    queueClose: () => {
        clearTimeout(SummerTech.navCloseTimeout);
        SummerTech.navCloseTimeout = setTimeout(() => {
            // console.log('nav closed.');
            SummerTech.nav.close();
        }, 250);
    },
    queueLosePreview: () => {
        clearTimeout(SummerTech.navLosePreviewTimeout);
        SummerTech.navLosePreviewTimeout = setTimeout(() => {
            document.body.dataset.previewSubTarget = "";
        }, 250);
    },
    cancelLosePreview: () => {
        if(SummerTech.navLosePreviewTimeout) {
            clearTimeout(SummerTech.navLosePreviewTimeout);
        }
    },
    cancelClose: () => {
        //Hovering or tapping inside the mobile menu lands here too, and opening the desktop menu there brings up the
        //gray overlay, shifts the panel up and dims its links
        if(SummerTech.mobileQuery.matches) {
            return;
        }

        // console.log('cancelClose called');

        // console.log('cancel');
        document.body.dataset.navOpen = "true";
        SummerTech.megaMenu.querySelector(".mm-container").inert = false;
        if(SummerTech.navCloseTimeout) {
            clearTimeout(SummerTech.navCloseTimeout);
        }
    },
    subFocus: (index, th) => {
        //No-children links should close the panel but keep the previous content visible while it collapses.
        if(th.dataset.hasChildren !== "false") {
            document.body.dataset.subTarget = index;
        }
        // console.log(th, index);
        SummerTech.nav.open(th);
    },
    //Opens or closes the mobile menu, keeping the menu button's aria-expanded in step with it
    setMobileOpen: (open) => {
        document.body.toggleAttribute("data-nav-open-mobile", open);
        document.querySelector("#site-navigation .menu-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    },
    mobileAccordion: (heading) => {

        //Toggle this section and collapse the rest, keeping each expand button's aria-expanded in step
        document.querySelectorAll(".mobile-link-heading").forEach(el=>{
            let expanded = el === heading && !el.classList.contains('expanded');
            el.classList.toggle('expanded', expanded);

            let expander = el.querySelector('.expander');
            if(expander) {
                expander.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            }
        });
        
    },
    previewSubNav: (th) => {
        document.body.dataset.previewSubTarget = th.dataset.id;
        // console.log(th.dataset.target, th);
        SummerTech.nav.cancelLosePreview();
    },
    //Focuses the first focusable element after #masthead. Returns false if there isn't one.
    focusAfterMasthead: () => {
        let masthead = document.getElementById("masthead");
        let candidates = document.querySelectorAll("a[href], button, input, select, textarea, summary, iframe, [tabindex]");

        for(let el of candidates) {
            if(el.tabIndex < 0 || masthead.contains(el) || !(masthead.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                continue;
            }

            //focus() does nothing on hidden, disabled or inert elements, so keep going until one takes it
            el.focus();
            if(document.activeElement === el) {
                return true;
            }
        }
        return false;
    },
    init: function() {
        var megaMenu = document.getElementById("mega-menu");
        SummerTech.megaMenu = megaMenu;
        var masthead = document.getElementById("masthead");

        let links = document.querySelectorAll("#masthead .nav-menu a");

        SummerTech.megaMenuTabs = Array.from(document.querySelectorAll("#mega-menu [data-target].has-children")).map(tab => tab.dataset.target);

        links.forEach(link => {
            link.addEventListener("mouseenter", () => {
                SummerTech.nav.previewSubNav(link);
            }); 
            link.addEventListener("focus", () => {
                SummerTech.nav.previewSubNav(link);
                //The open menu's cards belong to whichever sub link had focus, so close it rather than leave them up
                //when focus moves back to a top level link (e.g. tabbing from Camp Experience's last item to Parents)
                SummerTech.nav.close();
            });

            link.addEventListener("mouseleave", () => {
                SummerTech.nav.queueLosePreview();
            }); 
            link.addEventListener("blur", () => {
                SummerTech.nav.queueLosePreview();
            }); 
        }); 

        document.querySelector("#mega-menu-mini").addEventListener("mouseenter", () => {
            SummerTech.nav.cancelLosePreview();
        });

        //Keyboard equivalent of mouseenter. Tabbing off a top level link blurs it, which queues losing the preview,
        //and the sub links of a parent that isn't the current page's are hidden once the preview is gone.
        document.querySelector("#mega-menu-mini").addEventListener("focusin", () => {
            SummerTech.nav.cancelLosePreview();
        });

        document.querySelector("#mega-menu-mini").addEventListener("mouseleave", () => {
            SummerTech.nav.queueLosePreview();
            SummerTech.nav.queueClose();
        });

        megaMenu.addEventListener("mouseenter", () => {
            SummerTech.nav.cancelClose();
            SummerTech.nav.cancelLosePreview();
        });
        megaMenu.addEventListener("focusin", () => {
            SummerTech.nav.cancelClose();
            SummerTech.nav.cancelLosePreview();
        });
        megaMenu.addEventListener("mouseleave", () => {
            SummerTech.nav.queueClose();
            SummerTech.nav.queueLosePreview();
        });

        let quatCardHideTimeout = null;

        const queueQuatCardHide = () => {
            clearTimeout(quatCardHideTimeout);
            quatCardHideTimeout = setTimeout(() => {
                const stillInsideMenu = document.querySelector("#mega-menu .mm-card-link:hover, #mega-menu .quat-card:hover, #mega-menu .quat-link:hover, #mega-menu .mm-card-link:focus, #mega-menu .quat-card:focus, #mega-menu .quat-link:focus");
                if(!stillInsideMenu) {
                    SummerTech.nav.hideQuatCards();
                }
            }, 120);
        };

        
        megaMenu.querySelectorAll(".mm-content a.mm-card-link").forEach(link => {
            
            const showCard = link => {
                clearTimeout(quatCardHideTimeout);
                const rect = link.getBoundingClientRect();
                SummerTech.nav.showQuatCard(link.dataset.cardId, rect.top + rect.height / 2);
            };

            link.addEventListener("mouseenter", e => showCard(link));
            link.addEventListener("focus", e => showCard(link));
            link.addEventListener("mouseleave", () => {
                queueQuatCardHide();
            });
            link.addEventListener("blur", () => {
                const stillInsideMenu = document.activeElement && megaMenu.contains(document.activeElement);
                if(!stillInsideMenu) {
                    queueQuatCardHide();
                }
            });
        });

        megaMenu.querySelectorAll(".side-menu .quat-card, .side-menu .quat-link").forEach(card => {
            card.addEventListener("mouseenter", () => {
                clearTimeout(quatCardHideTimeout);
                const quatCard = card.closest(".quat-card");
                if(!quatCard) return;
                const rect = quatCard.getBoundingClientRect();
                SummerTech.nav.showQuatCard(quatCard.dataset.cardId, rect.top + rect.height / 2);
            });
            card.addEventListener("mouseleave", () => {
                queueQuatCardHide();
            });
        });

        //Only clear the nav target once the menu has fully collapsed, so re-entering it mid-collapse can still reopen it
        megaMenu.addEventListener("transitionend", (event) => {
            //Transitions on children (card images, descriptors, link backgrounds) bubble up here too
            if(event.target !== megaMenu || event.propertyName !== "height") { return; }

            if(document.body.dataset.navOpen !== "true") {
                clearTimeout(SummerTech.navClearTargetTimeout);
                document.body.dataset.navTarget = "null";

                //When fully closed and no longer in either menu area, restore current-page emphasis.
                if(!megaMenu.matches(":hover") && !document.querySelector("#mega-menu-mini:hover")) {
                    document.body.dataset.previewSubTarget = "";
                }
            }
        });

        //The mobile and desktop menus share #mega-menu and the body's nav attributes, so whatever one leaves behind
        //breaks the other
        SummerTech.mobileQuery.addEventListener("change", () => {
            SummerTech.nav.resetForBreakpoint();
        });

        //Throw in a timeout so that when we load the page, if we're hovered over a nav item, it doesn't immediately trigger the nav to open
        setTimeout(fn=>{
            SummerTech.nav.canOpen = true;
        }, 5);
    }
};


window.addEventListener("scroll", () => { SummerTech.nav.controlScrollClass(); });
window.addEventListener("load", () => { SummerTech.nav.controlScrollClass(); });


SummerTech.tickupText = {
	blocks: [],
	block:function(element) {
		this.element = element;
		this.current = Number.parseInt(element.innerHTML);
		this.target = Number.parseInt(element.dataset.target);
		this.padLeft = element.dataset.padLeft || "";

		if(Number.isNaN(this.current) || Number.isNaN(this.target)) {
			return false;
		}

		return this;
	},

	init: function() {
		document.querySelectorAll(".tickup-text").forEach(el=>{
			let block = new SummerTech.tickupText.block(el);
			if(block !== false) {
				this.blocks.push(block);
			}
		});

		if(this.blocks.length > 0) {
			SummerTech.tickupText.doTick(this.blocks);
		}

        //TODO: This doesn't work.
        document.addEventListener("aos:in", detail => {
            // console.log(detail);
            //SummerTech.tickupText.doTick();
        });
	},

	doTick: function(blocks) {

		let done = true;

		blocks.forEach(el=>{
			if(el.current < el.target) { 
				el.current++; 
				done=false;
				el.element.innerHTML = String(el.current).padStart(2,el.padLeft);
			}
		});

		if(!done) { requestAnimationFrame(()=>SummerTech.tickupText.doTick(blocks)); }
	}
}

SummerTech.tickupText.init();

SummerTech.init();