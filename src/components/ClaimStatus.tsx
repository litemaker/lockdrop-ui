/* eslint-disable react/prop-types */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ApiPromise } from '@polkadot/api';
import * as plasmUtils from '../helpers/plasmUtils';
import * as polkadotUtils from '@polkadot/util';
import * as polkadotCrypto from '@polkadot/util-crypto';
import { Claim, Lockdrop } from 'src/types/LockdropModels';
import {
    List,
    makeStyles,
    createStyles,
    ListSubheader,
    Divider,
    ListItem,
    Typography,
    ListItemText,
    ListItemIcon,
    Icon,
    ListItemSecondaryAction,
    IconButton,
    CircularProgress,
} from '@material-ui/core';
import plasmIcon from '../resources/plasm-icon.svg';
import dustyIcon from '../resources/dusty-icon.svg';
import Web3Utils from 'web3-utils';
import SendIcon from '@material-ui/icons/Send';
import CheckIcon from '@material-ui/icons/Check';
import { green } from '@material-ui/core/colors';
import BigNumber from 'bignumber.js';
import Badge from '@material-ui/core/Badge';
import ThumbUpIcon from '@material-ui/icons/ThumbUp';
import ThumbDownIcon from '@material-ui/icons/ThumbDown';
import {
    IonPopover,
    IonList,
    IonItem,
    IonListHeader,
    IonLabel,
    IonAlert,
    IonModal,
    IonButton,
    IonHeader,
    IonToolbar,
    IonContent,
    IonTitle,
    IonInput,
} from '@ionic/react';
import { toast } from 'react-toastify';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import ReplayIcon from '@material-ui/icons/Replay';
import EditIcon from '@material-ui/icons/Edit';
import CopyMessageBox from './CopyMessageBox';

interface Props {
    claimParams: Lockdrop[];
    plasmApi: ApiPromise;
    networkType: 'ETH' | 'BTC';
    plasmNetwork: 'Plasm' | 'Dusty';
    publicKey: string;
    // getLockerSig must return a hex string of the signature
    getLockerSig: (id: Uint8Array, sendToAddr: string) => Promise<string> | string;
}

const useStyles = makeStyles(theme =>
    createStyles({
        listRoot: {
            width: '100%',
            maxWidth: 'auto',
            backgroundColor: theme.palette.background.paper,
            position: 'relative',
            overflow: 'auto',
            height: 360,
            //minHeight: 360,
        },
        listSection: {
            backgroundColor: 'inherit',
        },
        ul: {
            backgroundColor: 'inherit',
            padding: 0,
        },
        lockListPage: {
            textAlign: 'center',
        },
        inline: {
            display: 'inline',
        },
        iconProgress: {
            color: green[500],
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 1,
        },
        emptyPanel: {
            textAlign: 'center',
            alignItems: 'center',
            justifyContent: 'center',
            margin: 'auto',
            padding: theme.spacing(3, 0),
        },
        claimVoteIcon: {
            margin: theme.spacing(1),
        },
    }),
);

const truncateString = (str: string, num: number) => {
    if (str.length <= num) {
        return str;
    }
    // Return str truncated with '...' concatenated to the end of str.
    return str.slice(0, num) + '...';
};

const epochToDays = (epoch: number) => {
    const epochDays = 60 * 60 * 24;
    return epoch / epochDays;
};

const loadAddrCache = (publicKey: string) => {
    const _cache = localStorage.getItem(`claim-addr:${publicKey}`);
    if (_cache === null) {
        return undefined;
    }
    // check if the cached address is valid
    const addrCheck = polkadotCrypto.checkAddress(_cache, 5);
    if (!addrCheck[0]) {
        return undefined;
    }
    return _cache;
};

const ClaimStatus: React.FC<Props> = ({
    claimParams,
    plasmApi,
    plasmNetwork = 'Plasm',
    networkType,
    publicKey,
    getLockerSig,
}) => {
    const classes = useStyles();

    const defaultAddr = useMemo(() => {
        return plasmUtils.generatePlmAddress(publicKey);
    }, [publicKey]);

    // global lockdrop claim requirements
    const [positiveVotes, setPositiveVotes] = useState(0);
    const [voteThreshold, setVoteThreshold] = useState(0);

    const [isLoadingBal, setLoadingBal] = useState(true);
    const [isLoadingClaims, setLoadingClaims] = useState(true);

    // open edit mode if no valid address was saved
    const [addrEditMode, setAddrEditMode] = useState(typeof loadAddrCache(publicKey) === 'undefined');

    // the address where PLMs will be sent
    const [plasmAddr, setPlasmAddr] = useState(loadAddrCache(publicKey) || defaultAddr);
    // a temporary address the user will set
    const [customClaimAddr, setCustomClaimAddr] = useState<string>();
    const [balance, setBalance] = useState('');

    const [claims, setClaims] = useState<(Claim | undefined)[]>([]);

    const fetchLockData = useCallback(async () => {
        // create claims IDs from all the lock parameters
        const claimIds = claimParams.map(c => {
            // get claim ID of current parameter
            return plasmUtils.createLockParam(
                c.type,
                c.transactionHash.toHex(),
                c.publicKey.toHex(),
                c.duration.toString(),
                c.value.toString(),
            ).hash;
        });

        const lockdropStates = claimIds.map(async id => {
            // parse plasm node to check claim status
            const claimRes = await plasmUtils.getClaimStatus(plasmApi, id);
            return claimRes;
        });

        const _claims = await Promise.all(lockdropStates);

        setClaims(_claims);
    }, [claimParams, plasmApi]);

    // initial plasm address balance fetch
    useEffect(() => {
        (async () => {
            const _bal = (await plasmUtils.getAddressBalance(plasmApi, plasmAddr, true)).toFixed(3);
            const formatBal = parseFloat(_bal).toLocaleString('en');
            setBalance(formatBal);
        })();
    }, [plasmApi, plasmAddr]);

    //store plasm address to local storage every time things changes
    useEffect(() => {
        const addrCheck = polkadotCrypto.checkAddress(plasmAddr, 5);
        // only save it locally if it is a valid address
        if (addrCheck[0]) {
            localStorage.setItem(`claim-addr:${publicKey}`, plasmAddr);
        }
    }, [plasmAddr, publicKey]);

    // fetch address balance periodically
    useEffect(() => {
        const interval = setInterval(async () => {
            const _bal = (await plasmUtils.getAddressBalance(plasmApi, plasmAddr, true)).toFixed(3);
            const formatBal = parseFloat(_bal).toLocaleString('en');
            const _voteReq = await plasmUtils.getLockdropVoteRequirements(plasmApi);
            setBalance(formatBal);
            setPositiveVotes(_voteReq.positiveVotes);
            setVoteThreshold(_voteReq.voteThreshold);

            await fetchLockData();
            setLoadingClaims(false);

            isLoadingBal && setLoadingBal(false);
        }, 15 * 1000);

        // cleanup hook
        return () => {
            clearInterval(interval);
        };
    });

    const handleEditAddress = () => {
        try {
            if (addrEditMode) {
                // if clicked finished edit

                if (!customClaimAddr) {
                    throw new Error('No Plasm Network address given');
                }

                const addrCheck = polkadotCrypto.checkAddress(customClaimAddr, 5);
                if (!addrCheck[0]) {
                    //setAddrEditMode(false);
                    throw new Error('Plasm address check error: ' + addrCheck[1]);
                }

                setPlasmAddr(customClaimAddr);
                setAddrEditMode(false);
            } else {
                // if clicked edit
                setAddrEditMode(true);
                // allow user to edit the address field and hide the claim list to prevent them from claiming
            }
        } catch (e) {
            console.log(e);
            toast.error(e.message);
        }
    };

    return (
        <div>
            <IonModal isOpen={addrEditMode} onDidDismiss={() => setAddrEditMode(false)}>
                <IonHeader>
                    <IonToolbar>
                        <IonTitle>Token Claim Address</IonTitle>
                    </IonToolbar>
                </IonHeader>

                <IonContent>
                    <IonList>
                        <IonItem>
                            <IonLabel className="ion-text-wrap">
                                This will set the Plasm Network address that will receive the lockdrop rewards when
                                claimed. You can always change this later. For more information, please consider reading{' '}
                                <a
                                    href="https://medium.com/stake-technologies/lockdrop-the-hitchhikers-guide-to-plasm-network-token-distribution-38299e14d5d4"
                                    rel="noopener noreferrer"
                                    target="_blank"
                                >
                                    this
                                </a>{' '}
                                article
                            </IonLabel>
                        </IonItem>
                        <IonItem>
                            <IonLabel position="stacked">Enter Plasm Address</IonLabel>
                            <IonInput
                                value={customClaimAddr}
                                placeholder={defaultAddr}
                                onIonChange={e => setCustomClaimAddr(e.detail.value || undefined)}
                                clearInput
                            ></IonInput>
                        </IonItem>
                        <IonItem>
                            <IonLabel className="ion-text-wrap">Your default Plasm Network address:</IonLabel>
                        </IonItem>
                        <IonItem>
                            <CopyMessageBox message={defaultAddr} isCode />
                        </IonItem>
                        <IonItem>
                            <IonButton
                                href={`https://polkadot.js.org/apps/?rpc=wss://rpc.${
                                    plasmNetwork === 'Dusty' ? 'dusty.' : ''
                                }plasmnet.io/#/accounts`}
                                rel="noopener noreferrer"
                                target="_blank"
                                slot="start"
                            >
                                Create a new account
                            </IonButton>
                            <IonButton
                                onClick={handleEditAddress}
                                disabled={isLoadingBal || isLoadingClaims || !customClaimAddr}
                                slot="end"
                            >
                                Set account
                            </IonButton>
                        </IonItem>
                    </IonList>
                </IonContent>
            </IonModal>
            <Typography variant="h5" component="h2" align="center">
                Sending to {plasmAddr}
                <IconButton
                    aria-label="finish"
                    color="primary"
                    onClick={handleEditAddress}
                    disabled={isLoadingBal || isLoadingClaims}
                >
                    <EditIcon fontSize="inherit" />
                </IconButton>
            </Typography>

            {balance && !addrEditMode && (
                <Typography variant="body1" component="p" align="center">
                    Has balance of {balance + ' '}
                    {plasmNetwork === 'Plasm' ? 'PLM' : 'PLD'}
                </Typography>
            )}

            <List className={classes.listRoot} subheader={<li />}>
                <li className={classes.listSection}>
                    <ul className={classes.ul}>
                        {isLoadingBal || isLoadingClaims || addrEditMode ? (
                            <div className={classes.emptyPanel}>
                                <CircularProgress />
                            </div>
                        ) : claimParams.length > 0 ? (
                            <>
                                <ListSubheader>You can claim {claimParams.length} locks</ListSubheader>
                                <Divider />

                                {claimParams.map((e, i) => (
                                    <div key={e.transactionHash.toHex()}>
                                        <ClaimItem
                                            lockParam={e}
                                            plasmApi={plasmApi}
                                            plasmNetwork={plasmNetwork}
                                            networkType={networkType}
                                            positiveVotes={positiveVotes}
                                            voteThreshold={voteThreshold}
                                            claimData={claims[i]}
                                            getLockerSig={getLockerSig}
                                            claimRecipientAddress={plasmAddr}
                                        />
                                    </div>
                                ))}
                            </>
                        ) : (
                            <>
                                <ListSubheader>You don&apos;t have any locks!</ListSubheader>
                                <Divider />
                                <div className={classes.emptyPanel}>
                                    <Typography>Why does the feeling of emptiness occupy so much space?</Typography>
                                    <Typography>-James de la Vega-</Typography>
                                </div>
                            </>
                        )}
                    </ul>
                </li>
            </List>
        </div>
    );
};

export default ClaimStatus;

interface ItemProps {
    lockParam: Lockdrop;
    plasmApi: ApiPromise;
    plasmNetwork: 'Plasm' | 'Dusty';
    networkType: 'BTC' | 'ETH';
    positiveVotes: number;
    voteThreshold: number;
    getLockerSig: (id: Uint8Array, sendToAddr: string) => Promise<string> | string;
    claimRecipientAddress: string;
    claimData?: Claim;
}

const ClaimItem: React.FC<ItemProps> = ({
    lockParam,
    plasmApi,
    plasmNetwork,
    networkType,
    positiveVotes,
    voteThreshold,
    getLockerSig,
    claimRecipientAddress,
    claimData,
}) => {
    const classes = useStyles();

    const claimId = useMemo(() => {
        return plasmUtils.createLockParam(
            lockParam.type,
            lockParam.transactionHash.toHex(),
            lockParam.publicKey.toHex(),
            lockParam.duration.toString(),
            lockParam.value.toString(),
        ).hash;
    }, [lockParam]);

    // plasmLockdrop.request()
    const [sendingRequest, setSendingRequest] = useState(false);
    // plasmLockdrop.claim()
    const [claimingLock, setClaimingLock] = useState(false);
    const [approveList, setApproveList] = useState<string[]>([]);
    const [declineList, setDeclineList] = useState<string[]>([]);

    // for popup modals
    const [showApproves, setShowApproves] = useState(false);
    const [showDeclines, setShowDeclines] = useState(false);

    const [claimConfirm, setClaimConfirm] = useState(false);

    const setVoteList = (_claim: Claim) => {
        const approves = _claim.approve.toJSON() as string[];
        setApproveList(approves);
        const decline = _claim.decline.toJSON() as string[];
        setDeclineList(decline);
    };

    const hasAllVotes = useMemo(() => {
        return approveList.length + declineList.length >= voteThreshold;
    }, [approveList, declineList, voteThreshold]);

    const reqAccepted = useMemo(() => {
        return approveList.length - declineList.length >= positiveVotes;
    }, [approveList, declineList, positiveVotes]);

    const receivingPlm = useMemo(() => {
        if (typeof claimData === 'undefined') return '0';

        return plasmUtils.femtoToPlm(new BigNumber(claimData.amount.toString())).toFixed();
    }, [claimData]);

    const plasmDefaultAddress = useMemo(() => {
        return plasmUtils.generatePlmAddress(lockParam.publicKey.toHex());
    }, [lockParam]);

    /**
     * sends a lockdrop claim request to the plasm node by the given lockdrop parameter
     * @param param lockdrop parameter data
     */
    const submitClaimReq = (param: Lockdrop) => {
        setSendingRequest(true);
        claimData = undefined;
        const _lock = plasmUtils.createLockParam(
            param.type,
            param.transactionHash.toHex(),
            param.publicKey.toHex(),
            param.duration.toString(),
            param.value.toString(),
        );
        const _nonce = plasmUtils.claimPowNonce(_lock.hash);
        // send lockdrop claim request
        plasmUtils // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .sendLockClaimRequest(plasmApi, _lock as any, _nonce)
            .then(res => {
                console.log('Claim ID: ' + _lock.hash + '\nRequest transaction hash:\n' + res.toHex());
            })
            .catch(e => {
                toast.error(e);
                console.log(e);
            });
    };

    /**
     * requests the plasm node to send the lockdrop rewards to the locker's address
     * @param id lockdrop claim ID
     */
    const submitTokenClaim = async (id: Uint8Array) => {
        try {
            if (hasAllVotes && reqAccepted && claimData && !claimData.complete.valueOf()) {
                // show loading circle
                setClaimingLock(true);
                let txHash: string;

                if (!!claimRecipientAddress && claimRecipientAddress !== plasmDefaultAddress) {
                    console.log('using claim_to function');
                    // hex string signature
                    const _sig = await getLockerSig(id, claimRecipientAddress);

                    // send claim_to() transaction
                    txHash = (
                        await plasmUtils.claimTo(plasmApi, id, claimRecipientAddress, polkadotUtils.hexToU8a(_sig))
                    ).toHex();
                } else {
                    console.log('using claim function');
                    txHash = (await plasmUtils.sendLockdropClaim(plasmApi, id)).toHex();
                }
                console.log('Token claim transaction hash:\n' + txHash);
            } else {
                throw new Error('Claim requirement was not met');
            }
        } catch (e) {
            console.log(e);
            toast.error(e.message);
        }
    };

    // initial set claim status
    useEffect(() => {
        // turn off loading if it's on
        if (claimData) {
            setVoteList(claimData);

            // turn off loading if it's on
            if (sendingRequest) setSendingRequest(false);
            if (claimData.complete.valueOf() && claimingLock) setClaimingLock(false);
        }
    }, [claimData, claimingLock, sendingRequest]);

    const ActionIcon = () => {
        if (claimData && !hasAllVotes) {
            return <HourglassEmptyIcon />;
        } else if (claimData === undefined) {
            return <SendIcon />;
        } else if (claimData && !reqAccepted) {
            return <ReplayIcon />;
        }
        return <CheckIcon />;
    };

    return (
        <>
            <IonAlert
                isOpen={claimConfirm}
                onDidDismiss={() => setClaimConfirm(false)}
                translucent
                header={'Confirm Rewards'}
                subHeader={'Real-time lockdrop claim'}
                message={`Sending claim rewards of ${receivingPlm} ${plasmNetwork === 'Plasm' ? 'PLM' : 'PLD'}.
                    to ${polkadotCrypto.encodeAddress(claimRecipientAddress, 5)}.
                    Please confirm`}
                buttons={[
                    {
                        text: 'Cancel',
                        role: 'cancel',
                        cssClass: 'secondary',
                        handler: () => {
                            setClaimConfirm(false);
                        },
                    },
                    {
                        text: 'Claim',
                        role: 'confirm',
                        handler: () => {
                            submitTokenClaim(claimId);
                        },
                    },
                ]}
            />
            <IonPopover isOpen={showApproves} onDidDismiss={() => setShowApproves(false)}>
                <IonList>
                    <IonListHeader>Claim Approvals</IonListHeader>
                    {approveList.length > 0 ? (
                        approveList.map(authority => (
                            <IonItem key={authority}>
                                <IonLabel>{authority}</IonLabel>
                            </IonItem>
                        ))
                    ) : (
                        <IonItem>
                            <IonLabel>No Approvals</IonLabel>
                        </IonItem>
                    )}
                </IonList>
            </IonPopover>
            <IonPopover isOpen={showDeclines} onDidDismiss={() => setShowDeclines(false)}>
                <IonList>
                    <IonListHeader>Claim Declines</IonListHeader>
                    {declineList.length > 0 ? (
                        declineList.map(authority => (
                            <IonItem key={authority}>
                                <IonLabel>{authority}</IonLabel>
                            </IonItem>
                        ))
                    ) : (
                        <IonItem>
                            <IonLabel>No Declines</IonLabel>
                        </IonItem>
                    )}
                </IonList>
            </IonPopover>
            <ListItem>
                <ListItemIcon>
                    <Icon>
                        {plasmNetwork === 'Plasm' ? <img src={plasmIcon} alt="" /> : <img src={dustyIcon} alt="" />}
                    </Icon>
                </ListItemIcon>
                <ListItemText>
                    <Typography component="h4" variant="h5" color="textPrimary">
                        Transaction Hash: {truncateString(lockParam.transactionHash.toHex(), 6)}
                    </Typography>
                    <Typography component="h5" variant="h6" className={classes.inline} color="textPrimary">
                        Locked{' '}
                        {networkType === 'ETH'
                            ? `${Web3Utils.fromWei(lockParam.value.toString(), 'ether')} ETH `
                            : `0 BTC `}
                        for {epochToDays(lockParam.duration.toNumber()).toString()} days
                    </Typography>

                    {claimData && (
                        <>
                            <br />
                            <Typography component="h5" variant="h6" className={classes.inline} color="textPrimary">
                                Receiving {receivingPlm} {plasmNetwork === 'Plasm' ? 'PLM' : 'PLD'}
                            </Typography>
                        </>
                    )}

                    <br />
                    <Typography component="p" variant="body2" className={classes.inline} color="textPrimary">
                        Claim ID: {claimId.toHex()}
                    </Typography>
                    <br />
                    <Typography
                        component="p"
                        variant="body2"
                        className={classes.inline}
                        color={claimData ? 'primary' : 'error'}
                    >
                        {claimData
                            ? claimData.complete.valueOf()
                                ? 'Claimed Lockdrop'
                                : 'Claim requested (not claimed)'
                            : 'Claim not requested'}
                    </Typography>
                    {claimData && (
                        <>
                            <IconButton color="primary" component="span" onClick={() => setShowApproves(true)}>
                                <Badge
                                    color="secondary"
                                    badgeContent={approveList.length}
                                    showZero
                                    max={999}
                                    className={classes.claimVoteIcon}
                                    anchorOrigin={{
                                        vertical: 'top',
                                        horizontal: 'left',
                                    }}
                                >
                                    <ThumbUpIcon />
                                </Badge>
                            </IconButton>

                            <IconButton color="primary" component="span" onClick={() => setShowDeclines(true)}>
                                <Badge
                                    color="secondary"
                                    badgeContent={declineList.length}
                                    showZero
                                    max={999}
                                    className={classes.claimVoteIcon}
                                    anchorOrigin={{
                                        vertical: 'top',
                                        horizontal: 'left',
                                    }}
                                >
                                    <ThumbDownIcon />
                                </Badge>
                            </IconButton>
                        </>
                    )}
                </ListItemText>

                <ListItemSecondaryAction>
                    <div>
                        <IconButton
                            edge="end"
                            aria-label="request"
                            onClick={() => {
                                claimData === undefined || !reqAccepted
                                    ? submitClaimReq(lockParam)
                                    : setClaimConfirm(true);
                            }}
                            color="primary"
                            disabled={
                                sendingRequest ||
                                claimData?.complete.valueOf() ||
                                claimingLock ||
                                (claimData && !hasAllVotes)
                            }
                        >
                            <ActionIcon />
                        </IconButton>
                        {sendingRequest || claimingLock ? (
                            <CircularProgress size={24} className={classes.iconProgress} />
                        ) : null}
                    </div>
                </ListItemSecondaryAction>
            </ListItem>
            <Divider />
        </>
    );
};
